/**
 * Výpočty pro provozní střediska: příjmy, náklady, výsledek, stav pokladny.
 * Čisté funkce bez DB.
 */
import type { CashCount, Transaction } from "../db/schema";
import { addDays, lastMonths, monthOf, type IsoDate, type Month } from "../dates";

export const UNITS = ["kemp", "wakesurf", "bistro", "wakeboard"] as const;
export type Unit = (typeof UNITS)[number];

export interface UnitSettings {
  /** Tolerovaný rozdíl při přepočtu pokladny (Kč). */
  cashTolerance: number;
  /** Po kolika dnech bez přepočtu hlásit pokladnu (jen když byl hotovostní pohyb). */
  cashCountMaxDays: number;
}

export const DEFAULT_UNIT_SETTINGS: UnitSettings = { cashTolerance: 200, cashCountMaxDays: 7 };

export interface MonthSummary {
  month: Month;
  income: number;
  costs: number;
  result: number;
}

export function monthSummary(tx: Transaction[], m: Month): MonthSummary {
  let income = 0;
  let costs = 0;
  for (const t of tx) {
    if (monthOf(t.date) !== m) continue;
    if (t.kind === "prijem") income += t.amount;
    else costs += t.amount;
  }
  return { month: m, income, costs, result: income - costs };
}

export function trend(tx: Transaction[], to: Month, n = 6): MonthSummary[] {
  return lastMonths(to, n).map((m) => monthSummary(tx, m));
}

export function byCategory(tx: Transaction[], m: Month, kind: Transaction["kind"]) {
  const map = new Map<string, number>();
  for (const t of tx) {
    if (t.kind !== kind || monthOf(t.date) !== m) continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

export interface CashState {
  /** Poslední přepočet, od kterého se počítá. */
  lastCount?: CashCount;
  /** Očekávaná hotovost dnes: poslední přepočet + hotovostní příjmy − hotovostní výdaje od něj. */
  expected: number;
  /** Hotovostní pohyby od posledního přepočtu. */
  cashIn: number;
  cashOut: number;
  /** Rozdíl při posledním přepočtu proti očekávanému stavu (přepočet − očekávání). */
  lastDifference: number | null;
}

const cashMoves = (tx: Transaction[], from: IsoDate | null, toExclusive: IsoDate | null) =>
  tx.filter(
    (t) => t.method === "hotove" && (from == null || t.date > from) && (toExclusive == null || t.date <= toExclusive),
  );

/**
 * Stav pokladny. Přepočet ze dne D zahrnuje všechny hotovostní pohyby do D včetně,
 * další pohyby se počítají od D+1.
 */
export function cashState(tx: Transaction[], counts: CashCount[]): CashState {
  const sorted = [...counts].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const last = sorted.at(-1);
  const prev = sorted.at(-2);
  const sum = (list: Transaction[], kind: Transaction["kind"]) =>
    list.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);

  const since = cashMoves(tx, last?.date ?? null, null);
  const cashIn = sum(since, "prijem");
  const cashOut = sum(since, "naklad");

  let lastDifference: number | null = null;
  if (last && prev) {
    const between = cashMoves(tx, prev.date, last.date);
    const expectedAtLast = prev.amount + sum(between, "prijem") - sum(between, "naklad");
    lastDifference = last.amount - expectedAtLast;
  }
  return { lastCount: last, expected: (last?.amount ?? 0) + cashIn - cashOut, cashIn, cashOut, lastDifference };
}

export interface UnitFlag {
  key: string;
  severity: "critical" | "warning";
  unit: Unit;
  title: string;
  detail?: string;
}

const kc = (n: number) => new Intl.NumberFormat("cs-CZ").format(n) + " Kč";

export function unitFlags(
  unit: Unit,
  label: string,
  tx: Transaction[],
  counts: CashCount[],
  today: IsoDate,
  s: UnitSettings = DEFAULT_UNIT_SETTINGS,
): UnitFlag[] {
  const out: UnitFlag[] = [];
  const cash = cashState(tx, counts);
  if (cash.lastDifference != null && Math.abs(cash.lastDifference) > s.cashTolerance) {
    out.push({
      key: `CASH_DIFF:${unit}:${cash.lastCount!.id}`,
      severity: "critical",
      unit,
      title: `${label}: v pokladně ${cash.lastDifference < 0 ? "chybí" : "přebývá"} ${kc(Math.abs(cash.lastDifference))}`,
      detail: `Přepočet ${cash.lastCount!.date}${cash.lastCount!.countedBy ? ` (${cash.lastCount!.countedBy})` : ""}.`,
    });
  }
  if (cash.expected < 0) {
    out.push({
      key: `CASH_NEGATIVE:${unit}`,
      severity: "warning",
      unit,
      title: `${label}: pokladna by měla být v mínusu (${kc(cash.expected)})`,
      detail: "Chybí zapsaný příjem, nebo je výdaj zapsaný jako hotovostní omylem.",
    });
  }
  const lastCashMove = tx.filter((t) => t.method === "hotove").map((t) => t.date).sort().at(-1);
  const lastCountDate = cash.lastCount?.date;
  if (lastCashMove && (!lastCountDate || lastCountDate < addDays(today, -s.cashCountMaxDays)) && lastCashMove > (lastCountDate ?? "")) {
    out.push({
      key: `CASH_NOT_COUNTED:${unit}`,
      severity: "warning",
      unit,
      title: `${label}: pokladna není přepočítaná ${lastCountDate ? `od ${lastCountDate}` : "vůbec"}`,
    });
  }
  const prevMonth = lastMonths(monthOf(today), 2)[0];
  const ms = monthSummary(tx, prevMonth);
  if (ms.costs > 0 && ms.result < 0) {
    out.push({
      key: `LOSS_MONTH:${unit}:${prevMonth}`,
      severity: "warning",
      unit,
      title: `${label}: ${prevMonth} ve ztrátě ${kc(ms.result)}`,
      detail: `Příjmy ${kc(ms.income)}, náklady ${kc(ms.costs)}.`,
    });
  }
  return out;
}
