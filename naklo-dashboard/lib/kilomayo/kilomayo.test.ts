import { describe, expect, it } from "vitest";
import { displayName, mapMembers, mapMonthStates } from "./client";
import { currentType, planMembers, presetToType } from "./members";
import type { Person } from "../db/schema";

const raw = [
  {
    id: "m1",
    contactDetail: { email: "a@example.com", phone: null },
    info: { fallbackNameWithLastNameFirst: "Nováková Jana" },
    workContracts: [
      { id: "c1", validSince: "2025-05-01", validUntil: "2025-09-30", hourlyWage: "150", monthlyWage: null, preset: { name: "DPP" } },
      { id: "c2", validSince: "2026-04-01", validUntil: null, hourlyWage: 180, monthlyWage: null, preset: { name: "IČ" } },
    ],
    documents: [],
  },
  {
    id: "m2",
    contactDetail: null,
    info: { fallbackNameWithLastNameFirst: "Demo Petr" },
    workContracts: [{ id: "c3", validSince: "2026-06-01", validUntil: null, hourlyWage: 0, monthlyWage: null, preset: { name: "Stáž" } }],
    documents: [{ id: "d", name: "smlouva", url: "https://example.com/d.pdf" }],
  },
];

const person = (id: number, fullName: string, kilomayoMemberId: string | null = null) =>
  ({ id, fullName, kilomayoMemberId }) as Person;

describe("KiloMayo mapování", () => {
  it("otočí jméno a převede čísla", () => {
    expect(displayName("Nováková Jana")).toBe("Jana Nováková");
    const m = mapMembers(raw);
    expect(m[0].contracts[0].hourlyWage).toBe(150);
    expect(m[1].documentUrl).toBe("https://example.com/d.pdf");
  });

  it("převede minuty na hodiny", () => {
    expect(mapMonthStates([{ memberId: "m1", yearMonth: "2026-10", statisticalDurationMinutes: 450 }])[0]).toEqual({
      memberId: "m1",
      month: "2026-10",
      hours: 7.5,
      shifts: 0,
    });
  });

  it("typy smluv", () => {
    expect(presetToType("IČ")).toBe("ICO");
    expect(presetToType("DPČ")).toBe("DPC");
    expect(presetToType("Stáž")).toBeNull();
  });

  it("aktuální typ podle platné smlouvy", () => {
    expect(currentType(mapMembers(raw)[0], "2026-11-04")).toBe("ICO");
  });

  it("spáruje podle jména, nové založí, stáž přeskočí", () => {
    const plan = planMembers([person(1, "Jana Novakova")], mapMembers(raw), "2026-11-04");
    expect(plan.link).toEqual([{ personId: 1, memberId: "m1", relationType: "ICO" }]);
    expect(plan.create.map((c) => c.member.name)).toEqual(["Petr Demo"]);
    expect(plan.contracts.map((c) => c.kilomayoContractId)).toEqual(["c1", "c2"]);
    expect(plan.skipped).toHaveLength(1);
  });
});
