import { describe, expect, it } from "vitest";
import { mapStatus, markAnswered, parseCzDate, parseInquiries, parseLeads, parsePronajmy } from "./parse";

describe("datumy", () => {
  it.each([
    ["17.7.2025", "2025-07-17"],
    ["12. 9. 2025", "2025-09-12"],
    ["04/04/2026 18:40:00", "2026-04-04"],
    ["2025-04-09 10:33:59", "2025-04-09"],
    ["21/6", null],
    ["", null],
  ])("%s → %s", (input, out) => expect(parseCzDate(input)).toBe(out));
});

describe("stavy", () => {
  it.each([
    ["Done, Potvrzeno - rezervace", "potvrzeno"],
    ["Done, Storno", "storno"],
    ["Odesláno nabídka", "jedna_se"],
    ["", "nova"],
  ])("%s → %s", (raw, st) => expect(mapStatus(raw)).toBe(st));
});

const header = [
  "Typ akce", "Kontakt", "IG post / marketing", "Company", "Počet lidí", "Cenová hladina", "Budget", "Utraceno",
  "Datum Start", "Datum End", "Status", "Tel", "Email", "Zdroj", "Cattering", "Rezervace", "Ubytování", "Loď", "Poznámka",
];

describe("Pronájmy / Akce", () => {
  it("čte řádek akce a přeskočí prázdné", () => {
    const rows = [
      header,
      ["Firemní akce", "Jana Ukázková", "", "Demo s.r.o.", "35", "", "40 000", "", "12.6.2027", "", "Done, Potvrzeno - rezervace",
        "777000000", "Jana@Demo.cz", "webform", "Ano", "Worklounge", "Stany", "Ano", "Teambuilding"],
      [],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ];
    const [e] = parsePronajmy(rows);
    expect(parsePronajmy(rows)).toHaveLength(1);
    expect(e).toMatchObject({
      type: "Firemní akce", company: "Demo s.r.o.", people: 35, budget: 40000, startDate: "2027-06-12",
      status: "potvrzeno", email: "jana@demo.cz", boat: true, space: "Worklounge", sourceKey: "sheet:Pronajmy:2",
    });
  });
});

describe("poptávky z webu", () => {
  it("bere odepsáno ze sloupce za zprávou a vyřadí testy", () => {
    const rows = [
      ["jmeno-a-prijmeni", "email", "field-form-1-1-1-0", "vase-zprava", "date", ""],
      ["Petr Demo", "petr@demo.cz", "600000000", "Rozlučka 15 lidí", "2025-05-29 15:33:53", "Odepsáno"],
      ["Eva Demo", "eva@demo.cz", "", "Svatba", "2025-06-01 10:00:00", ""],
      ["Test Debug", "test@test.cz", "", "ignorovat", "2025-06-01 10:00:00", ""],
    ];
    const q = parseInquiries(rows, "Solidpixels");
    expect(q.map((x) => [x.name, x.answered])).toEqual([["Petr Demo", true], ["Eva Demo", false]]);
    expect(markAnswered(q, [{ email: "eva@demo.cz" }])[1].answered).toBe(true);
  });
});

describe("leady", () => {
  it("čte společnost, stav a prioritu", () => {
    const rows = [
      ["Typ akce", "Kategorie", "Společnost", "Stav jednání", "Kontaktní osoba", "Kontaktní email", "Kontaktní telefon", "Lokalita", "Priorita", "Proč se hodí pro Náklo", "Web", "Zdroj"],
      ["Sportovní událost", "SUP", "Demo SUP", "TODO", "", "info@demo.cz", "", "Olomouc", "Vysoká", "Lokální partner", "https://demo.cz", ""],
    ];
    expect(parseLeads(rows)[0]).toMatchObject({ company: "Demo SUP", stage: "TODO", priority: "Vysoká" });
  });
});
