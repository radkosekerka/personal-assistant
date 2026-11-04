/** Datumové pomocníky nad řetězci "YYYY-MM-DD" a měsíci "YYYY-MM" (bez časových zón). */

export type Month = string; // "YYYY-MM"
export type IsoDate = string; // "YYYY-MM-DD"

export function monthOf(d: IsoDate): Month {
  return d.slice(0, 7);
}

export function addMonths(m: Month, n: number): Month {
  const [y, mo] = m.split("-").map(Number);
  const idx = y * 12 + (mo - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function daysInMonth(m: Month): number {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function monthStart(m: Month): IsoDate {
  return `${m}-01`;
}

export function monthEnd(m: Month): IsoDate {
  return `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Den v měsíci, oříznutý na délku měsíce (31. v únoru = 28./29.). */
export function dayOfMonth(m: Month, day: number): IsoDate {
  const d = Math.min(day, daysInMonth(m));
  return `${m}-${String(d).padStart(2, "0")}`;
}

export function todayIso(): IsoDate {
  // Česká zóna, aby se den neměnil o půlnoci UTC.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
}

/** Posledních n měsíců včetně měsíce `to`, od nejstaršího. */
export function lastMonths(to: Month, n: number): Month[] {
  return Array.from({ length: n }, (_, i) => addMonths(to, i - n + 1));
}

const MONTH_NAMES = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];

export function monthLabel(m: Month): string {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTH_NAMES[mo - 1]} ${y}`;
}

export function formatDate(d: IsoDate | null | undefined): string {
  if (!d) return "–";
  const [y, m, day] = d.split("-").map(Number);
  return `${day}. ${m}. ${y}`;
}

export function formatCzk(n: number | null | undefined): string {
  if (n == null) return "–";
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(n) + " Kč";
}
