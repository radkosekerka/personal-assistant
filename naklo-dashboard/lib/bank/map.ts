/** Převod odpovědí KB API na řádky DB. Čisté funkce, bez sítě a DB. */
import { createHash } from "node:crypto";
import type { KbBalance, KbTransaction } from "./kb/client";

export interface BalanceRow {
  bookedBalance: number | null;
  availableBalance: number | null;
  creditLine: number | null;
  balanceAt: Date | null;
}

const signed = (amount: number, ind: "CREDIT" | "DEBIT") => (ind === "DEBIT" ? -Math.abs(amount) : Math.abs(amount));

export function mapBalances(list: KbBalance[]): BalanceRow {
  const pick = (type: string) => list.find((b) => b.type === type);
  const booked = pick("PREVIOUSLY_CLOSED_BOOK");
  const avail = pick("CLOSING_AVAILABLE");
  const at = avail?.validAt ?? booked?.validAt;
  return {
    bookedBalance: booked ? signed(booked.amount.value, booked.creditDebitIndicator) : null,
    availableBalance: avail ? signed(avail.amount.value, avail.creditDebitIndicator) : null,
    creditLine: (avail ?? booked)?.creditLine?.value ?? null,
    balanceAt: at ? new Date(at) : null,
  };
}

export interface TxRow {
  externalId: string;
  status: "BOOK" | "PDNG";
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  type: string | null;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  variableSymbol: string | null;
  constantSymbol: string | null;
  specificSymbol: string | null;
  message: string | null;
  note: string | null;
}

const clean = (s: string | undefined | null) => {
  const t = s?.trim();
  return t ? t : null;
};

/** Číslo účtu protistrany jako 123-456789/0100 (bez úvodních nul), jinak IBAN. */
export function formatCounterpartyAccount(cp: KbTransaction["counterParty"]): string | null {
  if (!cp) return null;
  const no = clean(cp.accountNo);
  if (no && cp.bankCode) {
    const digits = no.replace(/\D/g, "").padStart(16, "0");
    const prefix = digits.slice(0, 6).replace(/^0+/, "");
    const base = digits.slice(6).replace(/^0+/, "");
    return `${prefix ? `${prefix}-` : ""}${base}/${cp.bankCode}`;
  }
  return clean(cp.iban) ?? no;
}

/**
 * Jedinečný klíč pohybu. KB doporučuje references.accountServicer (stejný pro PDNG i BOOK).
 * Když chybí (starší pohyby), vezme se otisk stabilních polí.
 */
export function txKey(t: KbTransaction): string {
  const s = clean(t.references?.accountServicer);
  if (s) return s;
  const raw = [t.entryReference, t.bookingDate ?? t.valueDate, t.creditDebitIndicator, t.amount.value, t.amount.currency, t.counterParty?.accountNo, t.references?.variable].join("|");
  return `h:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

export function mapTransaction(t: KbTransaction): TxRow {
  const isCard = t.transactionType === "CARD" || !!t.cardTransactionDetails;
  return {
    externalId: txKey(t),
    status: t.status === "PDNG" ? "PDNG" : "BOOK",
    bookingDate: t.bookingDate ?? null,
    valueDate: t.valueDate ?? null,
    amount: signed(t.amount.value, t.creditDebitIndicator),
    currency: t.amount.currency,
    type: t.transactionType ?? null,
    counterpartyName: clean(t.counterParty?.name),
    counterpartyAccount: formatCounterpartyAccount(t.counterParty),
    variableSymbol: clean(t.references?.variable),
    constantSymbol: clean(t.references?.constant),
    specificSymbol: clean(t.references?.specific),
    message: clean(t.references?.receiver) ?? (isCard ? null : clean(t.additionalTransactionInformation)),
    note: clean(t.references?.myDescription),
  };
}

/** Odkud stahovat: od posledního zaúčtovaného pohybu minus rezerva (opožděná zaúčtování), poprvé rok zpět. */
export function syncFrom(lastBookingDate: string | null | undefined, now: Date, overlapDays = 10, firstDays = 365): Date {
  const d = lastBookingDate ? new Date(`${lastBookingDate}T00:00:00Z`) : new Date(now.getTime() - firstDays * 86400_000);
  if (lastBookingDate) d.setUTCDate(d.getUTCDate() - overlapDays);
  // KB vrací nejvýš 2 roky historie.
  const min = new Date(now.getTime() - 729 * 86400_000);
  return d < min ? min : d;
}
