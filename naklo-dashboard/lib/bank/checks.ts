/** Přehledy a red flags nad bankovními daty. Čisté funkce bez DB. */
import type { BankAccount, BankConnection, BankTransaction } from "../db/schema";
import { addDays, lastMonths, monthOf, type IsoDate, type Month } from "../dates";

export interface BankSettings {
  /** Kolik dní před koncem souhlasu (12 měsíců) začít připomínat obnovu. */
  consentWarnDays: number;
  /** Po kolika dnech bez synchronizace hlásit, že data nejsou čerstvá. */
  staleDays: number;
  /** Od jaké částky hlásit odchozí platbu (Kč). */
  bigPaymentCzk: number;
  /** Kolik dní zpět hlásit velké platby. */
  bigPaymentDays: number;
}

export const DEFAULT_BANK_SETTINGS: BankSettings = { consentWarnDays: 30, staleDays: 2, bigPaymentCzk: 100_000, bigPaymentDays: 3 };

export interface BankFlag {
  key: string;
  severity: "critical" | "warning";
  title: string;
  detail?: string;
  href: string;
}

const fmt = (n: number, cur = "CZK") =>
  new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(n) + (cur === "CZK" ? " Kč" : ` ${cur}`);

export const accountLabel = (a: Pick<BankAccount, "name" | "iban">) =>
  a.name ? `${a.name} (…${a.iban.slice(-4)})` : `účet …${a.iban.slice(-4)}`;

export function bankFlags(
  conns: BankConnection[],
  accounts: BankAccount[],
  tx: BankTransaction[],
  now: Date,
  today: IsoDate,
  s: BankSettings = DEFAULT_BANK_SETTINGS,
): BankFlag[] {
  const out: BankFlag[] = [];
  const dayMs = 86400_000;

  for (const c of conns) {
    if (c.status === "registrace" || c.status === "autorizace") {
      out.push({
        key: `BANK_PENDING:${c.id}`,
        severity: "warning",
        title: `Banka: propojení „${c.label}“ není dokončené`,
        detail: "Dokonči schválení v MojeBanka (Finance → Bankovní propojení).",
        href: "/finance/propojeni",
      });
      continue;
    }
    if (c.status === "chyba") {
      out.push({
        key: `BANK_ERROR:${c.id}`,
        severity: "critical",
        title: `Banka: synchronizace „${c.label}“ selhává`,
        detail: c.lastError ?? undefined,
        href: "/finance/propojeni",
      });
    }
    const exp = c.refreshTokenExpiresAt;
    if (c.status === "vyprselo" || (exp && exp.getTime() <= now.getTime())) {
      out.push({
        key: `BANK_CONSENT_EXPIRED:${c.id}`,
        severity: "critical",
        title: `Banka: souhlas pro „${c.label}“ vypršel, data se nestahují`,
        detail: "Obnov ho tlačítkem Obnovit souhlas (přihlášení do KB, 12 měsíců).",
        href: "/finance/propojeni",
      });
    } else if (exp && exp.getTime() - now.getTime() < s.consentWarnDays * dayMs) {
      const days = Math.ceil((exp.getTime() - now.getTime()) / dayMs);
      out.push({
        key: `BANK_CONSENT_SOON:${c.id}:${exp.toISOString().slice(0, 10)}`,
        severity: "warning",
        title: `Banka: souhlas pro „${c.label}“ vyprší za ${days} dní`,
        detail: "Obnov ho včas, jinak se přestanou stahovat zůstatky a pohyby.",
        href: "/finance/propojeni",
      });
    }
    if (c.status === "aktivni" && (!c.lastSyncAt || now.getTime() - c.lastSyncAt.getTime() > s.staleDays * dayMs)) {
      out.push({
        key: `BANK_STALE:${c.id}:${today}`,
        severity: "warning",
        title: `Banka: data „${c.label}“ nejsou aktuální`,
        detail: c.lastSyncAt ? `Poslední synchronizace ${c.lastSyncAt.toISOString().slice(0, 10)}.` : "Ještě neproběhla žádná synchronizace.",
        href: "/finance/propojeni",
      });
    }
  }

  for (const a of accounts.filter((x) => x.active)) {
    if (a.lowBalanceLimit != null && a.availableBalance != null && a.availableBalance < a.lowBalanceLimit) {
      out.push({
        key: `BANK_LOW:${a.id}:${today}`,
        severity: "critical",
        title: `Nízký zůstatek: ${accountLabel(a)} má ${fmt(a.availableBalance, a.currency)}`,
        detail: `Hlídaná hranice je ${fmt(a.lowBalanceLimit, a.currency)}.`,
        href: `/finance?ucet=${a.id}`,
      });
    }
  }

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const since = addDays(today, -s.bigPaymentDays);
  for (const t of tx) {
    const d = t.bookingDate ?? t.valueDate;
    if (!d || d < since || t.amount >= 0 || t.currency !== "CZK" || -t.amount < s.bigPaymentCzk) continue;
    const a = byId.get(t.accountId);
    out.push({
      key: `BANK_BIG:${t.accountId}:${t.externalId}`,
      severity: "warning",
      title: `Velká platba ${fmt(-t.amount)} → ${t.counterpartyName ?? t.counterpartyAccount ?? "neznámý příjemce"}`,
      detail: [a ? accountLabel(a) : null, d, t.variableSymbol ? `VS ${t.variableSymbol}` : null, t.message].filter(Boolean).join(" · "),
      href: `/finance?ucet=${t.accountId}`,
    });
  }

  return out.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "critical" ? -1 : 1));
}

export interface CurrencyTotal {
  currency: string;
  booked: number;
  available: number;
}

/** Součty zůstatků po měnách (zvlášť, nepřepočítává se kurzem). */
export function totals(accounts: BankAccount[]): CurrencyTotal[] {
  const m = new Map<string, CurrencyTotal>();
  for (const a of accounts.filter((x) => x.active)) {
    const t = m.get(a.currency) ?? { currency: a.currency, booked: 0, available: 0 };
    t.booked += a.bookedBalance ?? 0;
    t.available += a.availableBalance ?? a.bookedBalance ?? 0;
    m.set(a.currency, t);
  }
  return [...m.values()].sort((x, y) => (x.currency === "CZK" ? -1 : y.currency === "CZK" ? 1 : x.currency.localeCompare(y.currency)));
}

export interface CashflowRow {
  month: Month;
  income: number;
  costs: number;
  net: number;
}

/** Příjmy a výdaje po měsících ze zaúčtovaných pohybů v CZK (převody mezi vlastními účty se nepočítají). */
export function cashflow(tx: BankTransaction[], ownAccounts: string[], to: Month, n = 6): CashflowRow[] {
  const own = new Set(ownAccounts.map(normAcc));
  const rows = new Map(lastMonths(to, n).map((m) => [m, { month: m, income: 0, costs: 0, net: 0 }]));
  for (const t of tx) {
    if (t.status !== "BOOK" || t.currency !== "CZK" || !t.bookingDate) continue;
    if (t.counterpartyAccount && own.has(normAcc(t.counterpartyAccount))) continue;
    const r = rows.get(monthOf(t.bookingDate));
    if (!r) continue;
    if (t.amount >= 0) r.income += t.amount;
    else r.costs += -t.amount;
    r.net = r.income - r.costs;
  }
  return [...rows.values()];
}

/** Sjednotí číslo účtu (IBAN CZ i 123-456/0100) na „prefix-číslo/banka“ bez nul, pro párování vlastních účtů. */
export function normAcc(s: string): string {
  const t = s.replace(/\s/g, "").toUpperCase();
  const iban = /^CZ\d{2}(\d{4})(\d{6})(\d{10})$/.exec(t);
  if (iban) {
    const [, bank, prefix, base] = iban;
    return `${prefix.replace(/^0+/, "")}-${base.replace(/^0+/, "")}/${bank}`;
  }
  const m = /^(?:(\d+)-)?(\d+)\/(\d{4})$/.exec(t);
  if (m) return `${(m[1] ?? "").replace(/^0+/, "")}-${m[2].replace(/^0+/, "")}/${m[3]}`;
  return t;
}
