import { describe, expect, it } from "vitest";
import { planHours } from "./sync";
import { parseCsv, parseNumber } from "./csv";
import type { Person } from "./db/schema";

const p = (id: number, fullName: string, kilomayoMemberId: string | null = null) =>
  ({ id, fullName, kilomayoMemberId }) as Person;

describe("párování hodin", () => {
  const people = [p(1, "Jan Novák", "km-1"), p(2, "Eva Příkladová"), p(3, "Petr Dvojník"), p(4, "Petr Dvojník")];

  it("páruje podle KiloMayo ID, pak podle jména bez diakritiky", () => {
    const plan = planHours(people, [
      { memberId: "km-1", month: "2026-10", hours: 10, shifts: 2 },
      { name: "eva prikladova", month: "2026-10", hours: 5, shifts: 1 },
    ]);
    expect(plan.upserts.map((u) => u.personId)).toEqual([1, 2]);
    expect(plan.unmatched).toHaveLength(0);
  });

  it("neznámé a nejednoznačné jméno nebo špatný měsíc nechá k ruční kontrole", () => {
    const plan = planHours(people, [
      { name: "Petr Dvojník", month: "2026-10", hours: 5, shifts: 1 },
      { name: "Cizí Člověk", month: "2026-10", hours: 5, shifts: 1 },
      { memberId: "km-1", month: "2026-13", hours: 5, shifts: 1 },
    ]);
    expect(plan.upserts).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(3);
  });
});

describe("CSV", () => {
  it("čte středníky, uvozovky a desetinnou čárku", () => {
    const rows = parseCsv('﻿jmeno;mesic;hodiny\n"Novák; Jan";2026-10;12,5\n');
    expect(rows).toEqual([{ jmeno: "Novák; Jan", mesic: "2026-10", hodiny: "12,5" }]);
    expect(parseNumber(rows[0].hodiny)).toBe(12.5);
  });
});
