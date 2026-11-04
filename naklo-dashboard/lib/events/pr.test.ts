import { describe, expect, it } from "vitest";
import { prFlags, reviewStats } from "./pr";
import type { EventRow, PrItem } from "../db/schema";

let id = 1;
const item = (o: Partial<PrItem>): PrItem => ({
  id: id++, kind: "recenze", channel: "Google", externalId: null, at: new Date("2026-11-01T10:00:00Z"), author: "Host",
  title: null, text: "Super", rating: 5, url: null, status: "nove", eventId: null, reach: null, ...o,
});
const ev = (o: Partial<EventRow>): EventRow => ({
  id: 100, sourceKey: "e", type: "Svatba", contactName: null, company: null, email: null, phone: null, people: null,
  budget: null, spent: null, startDate: "2026-11-15", endDate: null, status: "potvrzeno", statusRaw: null, source: null,
  space: null, accommodation: null, boat: false, catering: null, note: null, syncedAt: null, ...o,
});

describe("PR", () => {
  it("průměr recenzí po kanálech", () => {
    const s = reviewStats([item({ rating: 5 }), item({ rating: 4 }), item({ channel: "Mapy.cz", rating: 2, status: "vyrizeno" })]);
    expect(s.average).toBe(3.7);
    expect(s.byChannel.find((c) => c.channel === "Google")).toEqual({ channel: "Google", count: 2, average: 4.5 });
    expect(s.unanswered).toBe(2);
  });

  it("negativní recenze je kritická, pozitivní až po týdnu jako varování", () => {
    const f = prFlags([item({ rating: 2 }), item({ rating: 5 })], [], "2026-11-04");
    expect(f.map((x) => x.key.split(":")[0])).toEqual(["REVIEW_NEGATIVE"]);
    expect(prFlags([item({ rating: 5 })], [], "2026-11-09")[0].key).toMatch(/^REVIEW_UNANSWERED/);
  });

  it("zpráva bez odpovědi: varování po dni, kritické po třech", () => {
    const m = item({ kind: "zprava", channel: "Instagram", rating: null });
    expect(prFlags([m], [], "2026-11-02")[0].severity).toBe("warning");
    expect(prFlags([m], [], "2026-11-04")[0].severity).toBe("critical");
  });

  it("blízká potvrzená akce bez příspěvku", () => {
    expect(prFlags([], [ev({})], "2026-11-04")[0].key).toBe("EVENT_NO_POST:100");
    expect(prFlags([item({ kind: "prispevek", eventId: 100, status: "planovano" })], [ev({})], "2026-11-04")).toHaveLength(0);
  });
});
