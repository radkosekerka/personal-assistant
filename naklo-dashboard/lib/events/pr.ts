import type { EventRow, PrItem } from "../db/schema";
import { addDays, type IsoDate } from "../dates";
import type { EventFlag } from "./checks";

export interface ReviewStats {
  count: number;
  average: number | null;
  byChannel: { channel: string; count: number; average: number }[];
  unanswered: number;
}

export function reviewStats(items: PrItem[], since?: IsoDate): ReviewStats {
  const reviews = items.filter((i) => i.kind === "recenze" && i.rating != null && (!since || iso(i.at) >= since));
  const map = new Map<string, number[]>();
  for (const r of reviews) map.set(r.channel, [...(map.get(r.channel) ?? []), r.rating!]);
  const avg = (xs: number[]) => Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10;
  return {
    count: reviews.length,
    average: reviews.length ? avg(reviews.map((r) => r.rating!)) : null,
    byChannel: [...map.entries()].map(([channel, xs]) => ({ channel, count: xs.length, average: avg(xs) })),
    unanswered: reviews.filter((r) => r.status === "nove").length,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ageDays = (d: Date, today: IsoDate) => Math.floor((Date.parse(today) - Date.parse(iso(d))) / 86_400_000);

/** Red flags PR. */
export function prFlags(items: PrItem[], events: EventRow[], today: IsoDate): EventFlag[] {
  const out: EventFlag[] = [];
  for (const i of items) {
    if (i.status !== "nove") continue;
    const age = ageDays(i.at, today);
    if (i.kind === "recenze" && i.rating != null && i.rating <= 3) {
      out.push({
        key: `REVIEW_NEGATIVE:${i.id}`,
        severity: "critical",
        title: `${i.rating}★ recenze na ${i.channel} bez odpovědi (${i.author ?? "anonym"})`,
        detail: i.text?.slice(0, 160) ?? undefined,
        href: "/events/pr#recenze",
      });
    } else if ((i.kind === "zprava" || i.kind === "komentar") && age >= 1) {
      out.push({
        key: `MESSAGE_UNANSWERED:${i.id}`,
        severity: age >= 3 ? "critical" : "warning",
        title: `Neodpovězen${i.kind === "zprava" ? "á zpráva" : "ý komentář"} na ${i.channel}: ${i.author ?? "?"} (${age} d)`,
        detail: i.text?.slice(0, 160) ?? undefined,
        href: "/events/pr#zpravy",
      });
    } else if (i.kind === "recenze" && age >= 7) {
      out.push({
        key: `REVIEW_UNANSWERED:${i.id}`,
        severity: "warning",
        title: `Recenze na ${i.channel} bez odpovědi ${age} dní (${i.author ?? "anonym"})`,
        href: "/events/pr#recenze",
      });
    }
  }
  // Potvrzená akce do 21 dnů bez naplánovaného nebo publikovaného příspěvku.
  for (const e of events) {
    if (e.status !== "potvrzeno" || !e.startDate || e.startDate < today || e.startDate > addDays(today, 21)) continue;
    const hasPost = items.some((i) => i.kind === "prispevek" && i.eventId === e.id);
    if (!hasPost) {
      out.push({
        key: `EVENT_NO_POST:${e.id}`,
        severity: "warning",
        title: `Akce ${e.type ?? ""} ${e.startDate} nemá naplánovaný příspěvek`.replace("  ", " "),
        detail: "Doplnit IG nebo FB příspěvek, případně označit, že se nepropaguje (soukromá akce).",
        href: "/events/pr#prispevky",
      });
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
