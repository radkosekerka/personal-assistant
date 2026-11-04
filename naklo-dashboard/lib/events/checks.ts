import type { EventRow, Inquiry } from "../db/schema";
import { addDays, type IsoDate } from "../dates";

export interface EventFlag {
  key: string;
  severity: "critical" | "warning";
  title: string;
  detail?: string;
  href: string;
}

/** Red flags modulu Events. */
export function eventFlags(events: EventRow[], inquiries: Inquiry[], today: IsoDate): EventFlag[] {
  const out: EventFlag[] = [];
  for (const q of inquiries) {
    if (q.answered || !q.receivedAt) continue;
    const received = q.receivedAt.toISOString().slice(0, 10);
    const age = Math.round((Date.parse(today) - Date.parse(received)) / 86_400_000);
    if (age < 2) continue;
    out.push({
      key: `INQUIRY_UNANSWERED:${q.id}`,
      severity: age > 7 ? "critical" : "warning",
      title: `Neodpovězená poptávka: ${q.name ?? q.email ?? "?"} (${age} dní)`,
      detail: q.message?.slice(0, 140) ?? undefined,
      href: "/events#poptavky",
    });
  }
  for (const e of events) {
    const who = e.company ?? e.contactName ?? e.email ?? "?";
    if (e.status === "jedna_se" && e.startDate && e.startDate < today) {
      out.push({
        key: `EVENT_STALE:${e.id}`,
        severity: "warning",
        title: `Akce ${who} ${e.startDate} je pořád „rozjednaná“`,
        detail: "Termín už proběhl. Doplnit stav (proběhla, nebo storno).",
        href: "/events#pipeline",
      });
    }
    if (e.status === "potvrzeno" && e.startDate && e.startDate >= today && e.startDate <= addDays(today, 14)) {
      const missing = [!e.people && "počet lidí", !e.phone && !e.email && "kontakt"].filter(Boolean);
      if (missing.length) {
        out.push({
          key: `EVENT_MISSING_INFO:${e.id}`,
          severity: "warning",
          title: `Akce ${who} ${e.startDate}: chybí ${missing.join(", ")}`,
          href: "/events#kalendar",
        });
      }
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
