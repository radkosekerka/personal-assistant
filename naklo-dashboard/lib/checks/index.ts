/**
 * Kontroly a red flags. Čisté funkce nad snímkem dat, bez přístupu k DB,
 * aby šly testovat a pouštět stejně z dashboardu, z cronu i z WhatsApp agenta.
 */
import type {
  Contract,
  Invoice,
  Payment,
  Person,
  StaffingNeed,
  Training,
  TrainingRequirement,
  WorkMonth,
} from "../db/schema";
import {
  addDays,
  addMonths,
  daysInMonth,
  dayOfMonth,
  lastMonths,
  monthEnd,
  monthOf,
  monthStart,
  type IsoDate,
  type Month,
} from "../dates";

const kc = (n: number) => new Intl.NumberFormat("cs-CZ").format(n) + " Kč";

export type Severity = "critical" | "warning";

export type FlagCode =
  | "MISSING_TYPE"
  | "NO_CONTRACT"
  | "NO_VALID_CONTRACT_TODAY"
  | "DRAFT_CONTRACT"
  | "CONTRACT_EXPIRING"
  | "DPP_LIMIT"
  | "DPC_LIMIT"
  | "UNPAID_WAGE"
  | "ICO_MISSING_INVOICE"
  | "ICO_INVOICE_MISMATCH"
  | "INVOICE_OVERDUE"
  | "DUPLICATE_PAYMENT"
  | "TRAINING_MISSING"
  | "TRAINING_EXPIRING"
  | "STAFFING_GAP";

export interface Flag {
  /** Stabilní klíč, např. "NO_CONTRACT:12:2026-10". */
  key: string;
  code: FlagCode;
  severity: Severity;
  /** Chybí u flagů celého týmu (např. nedostatek lidí). */
  personId?: number;
  month?: Month;
  title: string;
  detail?: string;
}

export interface Settings {
  /** Do kolikátého dne následujícího měsíce se vyplácí mzda. */
  payday: number;
  /** Kolik dní po konci měsíce čekáme na fakturu od IČO. */
  invoiceGraceDays: number;
  dppYearlyHourLimit: number;
  dpcWeeklyHourLimit: number;
  expiringDays: number;
  /** Tolerance rozdílu faktury proti očekávané částce. */
  invoiceTolerance: number;
  /** Kolik měsíců zpět kontrolujeme výplaty a smlouvy. */
  lookbackMonths: number;
}

export const DEFAULT_SETTINGS: Settings = {
  payday: 15,
  invoiceGraceDays: 10,
  dppYearlyHourLimit: 300,
  dpcWeeklyHourLimit: 20,
  expiringDays: 30,
  invoiceTolerance: 0.05,
  lookbackMonths: 6,
};

export interface Snapshot {
  people: Person[];
  contracts: Contract[];
  workMonths: WorkMonth[];
  payments: Payment[];
  invoices: Invoice[];
  trainings?: Training[];
  trainingRequirements?: TrainingRequirement[];
  staffingNeeds?: StaffingNeed[];
}

const EMPLOYEE_TYPES = new Set(["HPP", "DPP", "DPC"]);

export function contractCovers(c: Contract, from: IsoDate, to: IsoDate): boolean {
  return c.validFrom <= to && (c.validTo == null || c.validTo >= from);
}

export function signedContractFor(contracts: Contract[], personId: number, m: Month): Contract | undefined {
  return contracts
    .filter((c) => c.personId === personId && c.status === "signed")
    .filter((c) => contractCovers(c, monthStart(m), monthEnd(m)))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
}

/** Očekávaná částka za měsíc: paušál, jinak hodiny × sazba (hrubá u zaměstnanců). */
export function expectedAmount(
  person: Person,
  contract: Contract | undefined,
  hours: number,
): number | null {
  const fee = contract?.monthlyFee ?? person.monthlyFee;
  if (fee != null && fee > 0) return fee;
  const rate = contract?.hourlyRate ?? person.hourlyRate;
  if (rate == null || hours <= 0) return null;
  return Math.round(rate * hours);
}

function hoursFor(s: Snapshot, personId: number, m: Month): number {
  return s.workMonths.find((w) => w.personId === personId && w.month === m)?.hours ?? 0;
}

function isInvoicePaid(s: Snapshot, inv: Invoice): boolean {
  if (inv.paidAt) return true;
  const paid = s.payments
    .filter((p) => p.personId === inv.personId && p.month === inv.month && p.kind === "faktura")
    .reduce((sum, p) => sum + p.amount, 0);
  return paid >= inv.amount;
}

function activeInMonth(p: Person, m: Month): boolean {
  if (p.startDate && p.startDate > monthEnd(m)) return false;
  if (p.endDate && p.endDate < monthStart(m)) return false;
  return true;
}

export function runChecks(s: Snapshot, today: IsoDate, settings: Settings = DEFAULT_SETTINGS): Flag[] {
  const flags: Flag[] = [];
  const add = (f: Omit<Flag, "key">) =>
    flags.push({ ...f, key: [f.code, f.personId ?? "", f.month ?? ""].join(":") });

  const thisMonth = monthOf(today);
  const months = lastMonths(thisMonth, settings.lookbackMonths);
  const year = today.slice(0, 4);

  for (const p of s.people) {
    const name = p.fullName;
    const own = s.contracts.filter((c) => c.personId === p.id);

    if (p.active && !p.relationType) {
      add({ code: "MISSING_TYPE", severity: "warning", personId: p.id, title: `${name}: chybí typ vztahu (HPP/DPP/DPČ/IČO)` });
    }

    // Smlouvy za měsíce, kdy člověk pracoval.
    for (const m of months) {
      const h = hoursFor(s, p.id, m);
      if (h > 0 && !signedContractFor(s.contracts, p.id, m)) {
        add({
          code: "NO_CONTRACT",
          severity: "critical",
          personId: p.id,
          month: m,
          title: `${name}: pracoval(a) bez podepsané smlouvy`,
          detail: `${h} h v měsíci ${m}, žádná podepsaná smlouva na toto období.`,
        });
      }
    }

    if (p.active) {
      const validToday = own.find((c) => c.status === "signed" && contractCovers(c, today, today));
      const workedThisMonth = hoursFor(s, p.id, thisMonth) > 0;
      if (!validToday && !workedThisMonth) {
        add({
          code: "NO_VALID_CONTRACT_TODAY",
          severity: "warning",
          personId: p.id,
          title: `${name}: aktivní, ale bez platné smlouvy k dnešku`,
        });
      }
      const draft = own.find((c) => c.status === "draft");
      if (draft && !validToday) {
        add({
          code: "DRAFT_CONTRACT",
          severity: "warning",
          personId: p.id,
          title: `${name}: smlouva je jen návrh, chybí podpis`,
          detail: `Návrh platný od ${draft.validFrom}.`,
        });
      }
      if (validToday?.validTo && validToday.validTo <= addDays(today, settings.expiringDays)) {
        const follow = own.find(
          (c) => c.id !== validToday.id && c.status === "signed" && c.validFrom > validToday.validFrom,
        );
        if (!follow) {
          add({
            code: "CONTRACT_EXPIRING",
            severity: "warning",
            personId: p.id,
            title: `${name}: smlouva končí ${validToday.validTo}`,
            detail: "Není podepsaná navazující smlouva.",
          });
        }
      }
    }

    // Limity DPP a DPČ.
    if (p.relationType === "DPP") {
      const yearHours = s.workMonths
        .filter((w) => w.personId === p.id && w.month.startsWith(year))
        .reduce((sum, w) => sum + w.hours, 0);
      const limit = settings.dppYearlyHourLimit;
      if (yearHours >= limit * 0.9) {
        add({
          code: "DPP_LIMIT",
          severity: yearHours >= limit ? "critical" : "warning",
          personId: p.id,
          title: `${name}: DPP ${yearHours} h z limitu ${limit} h za rok ${year}`,
        });
      }
    }
    if (p.relationType === "DPC") {
      // Poslední celý měsíc, rozpracovaný měsíc by průměr zkresloval.
      const m = addMonths(thisMonth, -1);
      const h = hoursFor(s, p.id, m);
      const weekly = h / (daysInMonth(m) / 7);
      if (weekly > settings.dpcWeeklyHourLimit) {
        add({
          code: "DPC_LIMIT",
          severity: "warning",
          personId: p.id,
          month: m,
          title: `${name}: DPČ průměrně ${weekly.toFixed(1)} h týdně (limit ${settings.dpcWeeklyHourLimit})`,
        });
      }
    }

    // Výplaty zaměstnanců.
    if (p.relationType && EMPLOYEE_TYPES.has(p.relationType)) {
      for (const m of months) {
        const due = dayOfMonth(addMonths(m, 1), settings.payday);
        if (today <= due) continue;
        const h = hoursFor(s, p.id, m);
        const contract = signedContractFor(s.contracts, p.id, m);
        const fee = contract?.monthlyFee ?? p.monthlyFee;
        const worked = h > 0 || (fee != null && fee > 0 && activeInMonth(p, m));
        if (!worked) continue;
        const paid = s.payments.some((x) => x.personId === p.id && x.month === m && x.kind === "mzda");
        if (!paid) {
          const exp = expectedAmount(p, contract, h);
          add({
            code: "UNPAID_WAGE",
            severity: "critical",
            personId: p.id,
            month: m,
            title: `${name}: chybí výplata za ${m}`,
            detail: `Termín ${due}. ${h} h${exp ? `, očekáváno ~${kc(exp)} hrubého` : ""}.`,
          });
        }
      }
    }

    // Faktury IČO.
    if (p.relationType === "ICO") {
      for (const m of months) {
        const h = hoursFor(s, p.id, m);
        const contract = signedContractFor(s.contracts, p.id, m);
        const fee = contract?.monthlyFee ?? p.monthlyFee;
        const worked = h > 0 || (fee != null && fee > 0 && activeInMonth(p, m));
        if (!worked) continue;
        const inv = s.invoices.filter((i) => i.personId === p.id && i.month === m);
        if (inv.length === 0) {
          if (today > addDays(monthEnd(m), settings.invoiceGraceDays)) {
            add({
              code: "ICO_MISSING_INVOICE",
              severity: "warning",
              personId: p.id,
              month: m,
              title: `${name}: chybí faktura za ${m}`,
              detail: h > 0 ? `${h} h odpracováno.` : undefined,
            });
          }
          continue;
        }
        const exp = expectedAmount(p, contract, h);
        const total = inv.reduce((sum, i) => sum + i.amount, 0);
        if (exp && Math.abs(total - exp) / exp > settings.invoiceTolerance) {
          add({
            code: "ICO_INVOICE_MISMATCH",
            severity: "warning",
            personId: p.id,
            month: m,
            title: `${name}: faktura ${kc(total)} nesedí na očekávaných ${kc(exp)}`,
            detail: h > 0 ? `${h} h × sazba ze smlouvy.` : "Paušál ze smlouvy.",
          });
        }
      }
    }
  }

  flags.push(...teamFlags(s, today, settings));

  // Faktury po splatnosti.
  for (const inv of s.invoices) {
    if (inv.dueDate && inv.dueDate < today && !isInvoicePaid(s, inv)) {
      const p = s.people.find((x) => x.id === inv.personId);
      add({
        code: "INVOICE_OVERDUE",
        severity: "critical",
        personId: inv.personId,
        month: inv.month,
        title: `${p?.fullName ?? "?"}: faktura ${inv.number ?? ""} po splatnosti`.replace("  ", " "),
        detail: `${kc(inv.amount)}, splatnost ${inv.dueDate}.`,
      });
    }
  }

  // Duplicitní platby.
  const seen = new Map<string, number>();
  for (const pay of s.payments) {
    const k = `${pay.personId}|${pay.month}|${pay.kind}|${pay.amount}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seen) {
    if (n < 2) continue;
    const [personId, month, kind, amount] = k.split("|");
    const p = s.people.find((x) => x.id === Number(personId));
    add({
      code: "DUPLICATE_PAYMENT",
      severity: "warning",
      personId: Number(personId),
      month,
      title: `${p?.fullName ?? "?"}: ${n}× stejná platba (${kind}, ${kc(Number(amount))}) za ${month}`,
    });
  }

  const order = { critical: 0, warning: 1 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity] || (b.month ?? "").localeCompare(a.month ?? ""));
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Školení a obsazenost pozic. */
export function teamFlags(s: Snapshot, today: IsoDate, settings: Settings = DEFAULT_SETTINGS): Flag[] {
  const out: Flag[] = [];
  const reqs = s.trainingRequirements ?? [];
  const trainings = s.trainings ?? [];
  const active = s.people.filter((p) => p.active && (!p.endDate || p.endDate >= today));

  for (const p of active) {
    for (const r of reqs.filter((r) => norm(r.position) === norm(p.position))) {
      const own = trainings
        .filter((t) => t.personId === p.id && norm(t.name) === norm(r.name))
        .sort((a, b) => (b.validTo ?? "9999").localeCompare(a.validTo ?? "9999"))[0];
      if (!own || (own.validTo && own.validTo < today)) {
        out.push({
          key: `TRAINING_MISSING:${p.id}:${norm(r.name)}`,
          code: "TRAINING_MISSING",
          severity: "warning",
          personId: p.id,
          title: `${p.fullName}: ${own ? "propadlé" : "chybí"} školení „${r.name}“`,
          detail: `Vyžaduje pozice ${p.position}.`,
        });
      } else if (own.validTo && own.validTo <= addDays(today, settings.expiringDays)) {
        out.push({
          key: `TRAINING_EXPIRING:${p.id}:${norm(r.name)}`,
          code: "TRAINING_EXPIRING",
          severity: "warning",
          personId: p.id,
          title: `${p.fullName}: školení „${r.name}“ končí ${own.validTo}`,
        });
      }
    }
  }

  for (const n of s.staffingNeeds ?? []) {
    // Kontrolujeme aktuální období a období začínající do 60 dnů (příprava sezóny).
    if (n.validTo < today || n.validFrom > addDays(today, 60)) continue;
    const have = active.filter(
      (p) => norm(p.position) === norm(n.position) && (!p.endDate || p.endDate >= n.validFrom),
    ).length;
    if (have < n.needed) {
      out.push({
        key: `STAFFING_GAP:${norm(n.position)}:${n.validFrom}`,
        code: "STAFFING_GAP",
        severity: n.validFrom <= today ? "critical" : "warning",
        title: `Chybí ${n.needed - have}× ${n.position}`,
        detail: `Potřeba ${n.needed}, máme ${have} (období ${n.validFrom} až ${n.validTo}).`,
      });
    }
  }
  return out;
}

export interface MonthRow {
  person: Person;
  hours: number;
  contract?: Contract;
  expected: number | null;
  invoiced: number | null;
  paid: number;
  status: "ok" | "unpaid" | "partial" | "no-contract" | "no-work";
}

/** Řádky pro přehled měsíce: hodiny × sazba proti tomu, co se zaplatilo. */
export function monthRows(s: Snapshot, m: Month): MonthRow[] {
  return s.people
    .filter((p) => activeInMonth(p, m) && (p.active || hoursFor(s, p.id, m) > 0))
    .map((p) => {
      const hours = hoursFor(s, p.id, m);
      const contract = signedContractFor(s.contracts, p.id, m);
      const expected = expectedAmount(p, contract, hours);
      const inv = s.invoices.filter((i) => i.personId === p.id && i.month === m);
      const invoiced = inv.length ? inv.reduce((sum, i) => sum + i.amount, 0) : null;
      const kind = p.relationType === "ICO" ? "faktura" : "mzda";
      const paid = s.payments
        .filter((x) => x.personId === p.id && x.month === m && x.kind === kind)
        .reduce((sum, x) => sum + x.amount, 0);
      let status: MonthRow["status"];
      if (hours === 0 && !expected) status = "no-work";
      else if (!contract) status = "no-contract";
      else if (paid === 0) status = "unpaid";
      else if (p.relationType === "ICO" && invoiced && paid < invoiced) status = "partial";
      else status = "ok";
      return { person: p, hours, contract, expected, invoiced, paid, status };
    })
    .sort((a, b) => a.person.fullName.localeCompare(b.person.fullName, "cs"));
}
