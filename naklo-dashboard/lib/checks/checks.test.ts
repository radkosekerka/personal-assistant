import { describe, expect, it } from "vitest";
import { monthRows, runChecks, type Snapshot } from "./index";
import type { Contract, Invoice, Payment, Person, WorkMonth } from "../db/schema";
import { teamFlags } from "./index";

let seq = 1;
const person = (o: Partial<Person>): Person => ({
  id: seq++,
  companyId: null,
  fullName: "Test Osoba",
  email: null,
  phone: null,
  position: null,
  relationType: "DPP",
  ico: null,
  kilomayoMemberId: null,
  startDate: null,
  endDate: null,
  hourlyRate: 200,
  monthlyFee: null,
  active: true,
  performance: null,
  performanceNote: null,
  notes: null,
  ...o,
});
const contract = (o: Partial<Contract> & { personId: number }): Contract => ({
  id: seq++,
  type: "DPP",
  status: "signed",
  validFrom: "2026-01-01",
  validTo: null,
  hourlyRate: null,
  monthlyFee: null,
  driveUrl: null,
  signedAt: null,
  ...o,
});
const work = (personId: number, month: string, hours: number): WorkMonth => ({
  id: seq++, personId, month, hours, shifts: 0, source: "kilomayo", syncedAt: null,
});
const pay = (o: Partial<Payment> & { personId: number; month: string }): Payment => ({
  id: seq++, kind: "mzda", amount: 1000, paidAt: "2026-10-10", reference: null, source: "bank", ...o,
});
const invoice = (o: Partial<Invoice> & { personId: number; month: string; amount: number }): Invoice => ({
  id: seq++, number: "FV1", receivedAt: null, dueDate: null, paidAt: null, driveUrl: null, ...o,
});

const empty = (): Snapshot => ({ people: [], contracts: [], workMonths: [], payments: [], invoices: [] });
const codes = (s: Snapshot, today: string) => runChecks(s, today).map((f) => f.code);

describe("smlouvy", () => {
  it("hlásí práci bez podepsané smlouvy jako kritickou", () => {
    const s = empty();
    const p = person({});
    s.people.push(p);
    s.workMonths.push(work(p.id, "2026-10", 40));
    s.payments.push(pay({ personId: p.id, month: "2026-10" }));
    const f = runChecks(s, "2026-11-04").find((x) => x.code === "NO_CONTRACT");
    expect(f?.severity).toBe("critical");
    expect(f?.month).toBe("2026-10");
  });

  it("návrh smlouvy se nepočítá jako podepsaná", () => {
    const s = empty();
    const p = person({});
    s.people.push(p);
    s.contracts.push(contract({ personId: p.id, status: "draft", validFrom: "2026-11-01" }));
    expect(codes(s, "2026-11-04")).toEqual(expect.arrayContaining(["DRAFT_CONTRACT", "NO_VALID_CONTRACT_TODAY"]));
  });

  it("upozorní na konec smlouvy jen když chybí navazující", () => {
    const s = empty();
    const p = person({});
    s.people.push(p);
    s.contracts.push(contract({ personId: p.id, validTo: "2026-11-20" }));
    expect(codes(s, "2026-11-04")).toContain("CONTRACT_EXPIRING");
    s.contracts.push(contract({ personId: p.id, validFrom: "2026-11-21" }));
    expect(codes(s, "2026-11-04")).not.toContain("CONTRACT_EXPIRING");
  });
});

describe("výplaty", () => {
  it("chybějící mzda po termínu výplaty je kritická, před termínem ne", () => {
    const s = empty();
    const p = person({});
    s.people.push(p);
    s.contracts.push(contract({ personId: p.id }));
    s.workMonths.push(work(p.id, "2026-10", 20));
    expect(codes(s, "2026-11-10")).not.toContain("UNPAID_WAGE");
    const f = runChecks(s, "2026-11-16").find((x) => x.code === "UNPAID_WAGE");
    expect(f?.detail).toMatch(/4\s000 Kč/);
    s.payments.push(pay({ personId: p.id, month: "2026-10" }));
    expect(codes(s, "2026-11-16")).not.toContain("UNPAID_WAGE");
  });

  it("odhalí duplicitní platbu", () => {
    const s = empty();
    const p = person({});
    s.people.push(p);
    s.payments.push(pay({ personId: p.id, month: "2026-09" }), pay({ personId: p.id, month: "2026-09" }));
    expect(codes(s, "2026-11-04")).toContain("DUPLICATE_PAYMENT");
  });
});

describe("limity", () => {
  it("DPP: varování od 90 %, kritické od 300 h", () => {
    const s = empty();
    const p = person({});
    s.people.push(p);
    s.contracts.push(contract({ personId: p.id }));
    s.workMonths.push(work(p.id, "2026-06", 150), work(p.id, "2026-07", 125));
    expect(runChecks(s, "2026-08-01").find((f) => f.code === "DPP_LIMIT")?.severity).toBe("warning");
    s.workMonths.push(work(p.id, "2026-08", 30));
    expect(runChecks(s, "2026-09-01").find((f) => f.code === "DPP_LIMIT")?.severity).toBe("critical");
  });

  it("DPČ: průměr nad 20 h týdně za minulý měsíc", () => {
    const s = empty();
    const p = person({ relationType: "DPC" });
    s.people.push(p);
    s.contracts.push(contract({ personId: p.id, type: "DPC" }));
    s.workMonths.push(work(p.id, "2026-10", 100));
    expect(codes(s, "2026-11-04")).toContain("DPC_LIMIT");
  });
});

describe("IČO", () => {
  const setup = () => {
    const s = empty();
    const p = person({ relationType: "ICO", hourlyRate: 300 });
    s.people.push(p);
    s.contracts.push(contract({ personId: p.id, type: "ICO" }));
    s.workMonths.push(work(p.id, "2026-10", 10));
    return { s, p };
  };

  it("chybějící faktura až po lhůtě", () => {
    const { s } = setup();
    expect(codes(s, "2026-11-05")).not.toContain("ICO_MISSING_INVOICE");
    expect(codes(s, "2026-11-11")).toContain("ICO_MISSING_INVOICE");
  });

  it("faktura nesedí na hodiny × sazbu", () => {
    const { s, p } = setup();
    s.invoices.push(invoice({ personId: p.id, month: "2026-10", amount: 4500 }));
    expect(codes(s, "2026-11-11")).toContain("ICO_INVOICE_MISMATCH");
  });

  it("faktura po splatnosti, dokud není zaplacená", () => {
    const { s, p } = setup();
    s.invoices.push(invoice({ personId: p.id, month: "2026-10", amount: 3000, dueDate: "2026-11-01" }));
    expect(codes(s, "2026-11-04")).toContain("INVOICE_OVERDUE");
    s.payments.push(pay({ personId: p.id, month: "2026-10", kind: "faktura", amount: 3000 }));
    expect(codes(s, "2026-11-04")).not.toContain("INVOICE_OVERDUE");
  });

  it("přehled měsíce počítá očekávanou částku a stav", () => {
    const { s, p } = setup();
    s.invoices.push(invoice({ personId: p.id, month: "2026-10", amount: 3000 }));
    const row = monthRows(s, "2026-10")[0];
    expect(row.expected).toBe(3000);
    expect(row.status).toBe("unpaid");
  });
});

describe("tým", () => {
  it("chybějící a propadlé školení podle pozice", () => {
    const s = empty();
    const a = person({ position: "Kapitán lodi" });
    const b = person({ position: "Kapitán lodi" });
    s.people.push(a, b);
    s.trainingRequirements = [{ id: 1, position: "kapitán lodi", name: "Průkaz vůdce plavidla" }];
    s.trainings = [{ id: 1, personId: b.id, name: "Průkaz vůdce plavidla", completedAt: null, validTo: "2026-11-20" }];
    const f = teamFlags(s, "2026-11-04");
    expect(f.find((x) => x.personId === a.id)?.code).toBe("TRAINING_MISSING");
    expect(f.find((x) => x.personId === b.id)?.code).toBe("TRAINING_EXPIRING");
  });

  it("nedostatek lidí na pozici před sezónou", () => {
    const s = empty();
    s.people.push(person({ position: "Obsluha vleku" }));
    s.staffingNeeds = [{ id: 1, position: "Obsluha vleku", needed: 3, validFrom: "2026-12-01", validTo: "2027-03-31", module: null }];
    const f = teamFlags(s, "2026-11-04");
    expect(f[0]).toMatchObject({ code: "STAFFING_GAP", severity: "warning", title: "Chybí 2× Obsluha vleku" });
    expect(teamFlags(s, "2026-08-01")).toHaveLength(0);
  });
});
