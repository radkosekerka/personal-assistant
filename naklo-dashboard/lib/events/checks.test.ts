import { describe, expect, it } from "vitest";
import { eventFlags } from "./checks";
import type { EventRow, Inquiry } from "../db/schema";

const inq = (o: Partial<Inquiry>): Inquiry => ({
  id: 1, sourceKey: "x", receivedAt: new Date("2026-10-20T10:00:00Z"), name: "Demo", email: "d@demo.cz",
  phone: null, message: "Svatba", channel: "New-web", answered: false, ...o,
});
const ev = (o: Partial<EventRow>): EventRow => ({
  id: 1, sourceKey: "y", type: null, contactName: "Demo", company: null, email: "d@demo.cz", phone: null,
  people: null, budget: null, spent: null, startDate: null, endDate: null, status: "nova", statusRaw: null,
  source: null, space: null, accommodation: null, boat: false, catering: null, note: null, syncedAt: null, ...o,
});

describe("events red flags", () => {
  it("neodpovězená poptávka: varování po 2 dnech, kritické po týdnu", () => {
    expect(eventFlags([], [inq({})], "2026-10-21")).toHaveLength(0);
    expect(eventFlags([], [inq({})], "2026-10-23")[0].severity).toBe("warning");
    expect(eventFlags([], [inq({})], "2026-11-04")[0].severity).toBe("critical");
    expect(eventFlags([], [inq({ answered: true })], "2026-11-04")).toHaveLength(0);
  });

  it("rozjednaná akce po termínu a potvrzená akce bez počtu lidí", () => {
    const f = eventFlags(
      [ev({ id: 1, status: "jedna_se", startDate: "2026-10-01" }), ev({ id: 2, status: "potvrzeno", startDate: "2026-11-10" })],
      [],
      "2026-11-04",
    );
    expect(f.map((x) => x.key)).toEqual(["EVENT_STALE:1", "EVENT_MISSING_INFO:2"]);
  });
});
