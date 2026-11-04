import { describe, expect, it } from "vitest";
import { byCategory, cashState, monthSummary, unitFlags } from "./index";
import type { CashCount, Transaction } from "../db/schema";

let id = 1;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: id++, unit: "bistro", date: "2026-10-10", kind: "prijem", category: "Tržba", amount: 1000,
  method: "hotove", source: "manual", externalId: null, note: null, ...o,
});
const cc = (date: string, amount: number): CashCount => ({ id: id++, unit: "bistro", date, amount, countedBy: "Eva", note: null });

describe("příjmy a náklady", () => {
  it("měsíční součty a kategorie", () => {
    const list = [
      tx({ amount: 5000 }), tx({ amount: 2000, method: "karta" }),
      tx({ kind: "naklad", category: "Zboží", amount: 3000, method: "prevod" }),
      tx({ date: "2026-09-30", amount: 999 }),
    ];
    expect(monthSummary(list, "2026-10")).toEqual({ month: "2026-10", income: 7000, costs: 3000, result: 4000 });
    expect(byCategory(list, "2026-10", "prijem")).toEqual([{ category: "Tržba", amount: 7000 }]);
  });
});

describe("pokladna", () => {
  it("očekávaný stav = přepočet + hotovost od něj, kartu nepočítá", () => {
    const list = [tx({ date: "2026-10-05", amount: 500 }), tx({ date: "2026-10-12", amount: 800 }), tx({ date: "2026-10-12", amount: 9999, method: "karta" }),
      tx({ date: "2026-10-13", kind: "naklad", amount: 300 })];
    const s = cashState(list, [cc("2026-10-10", 2000)]);
    expect(s.expected).toBe(2500);
    expect(s.lastDifference).toBeNull();
  });

  it("rozdíl mezi dvěma přepočty nad toleranci je kritický", () => {
    const list = [tx({ date: "2026-10-11", amount: 1000 })];
    const counts = [cc("2026-10-10", 2000), cc("2026-10-12", 2500)];
    expect(cashState(list, counts).lastDifference).toBe(-500);
    const f = unitFlags("bistro", "Bistro", list, counts, "2026-10-13");
    expect(f[0]).toMatchObject({ severity: "critical", title: expect.stringContaining("chybí 500") });
  });

  it("nepřepočítaná pokladna a ztrátový měsíc", () => {
    const list = [tx({ date: "2026-10-20", amount: 100 }), tx({ date: "2026-10-21", kind: "naklad", amount: 5000, method: "prevod" })];
    const codes = unitFlags("bistro", "Bistro", list, [cc("2026-10-01", 0)], "2026-11-04").map((f) => f.key.split(":")[0]);
    expect(codes).toEqual(["CASH_NOT_COUNTED", "LOSS_MONTH"]);
  });
});
