import { asc, desc } from "drizzle-orm";
import { getDb, schema } from "../db";
import { todayIso } from "../dates";
import { eventFlags } from "./checks";
import { prFlags } from "./pr";

export async function eventsData() {
  const db = getDb();
  const [events, inquiries, leads, pr] = await Promise.all([
    db.select().from(schema.events).orderBy(asc(schema.events.startDate)),
    db.select().from(schema.inquiries).orderBy(desc(schema.inquiries.receivedAt)),
    db.select().from(schema.leads),
    db.select().from(schema.prItems).orderBy(desc(schema.prItems.at)),
  ]);
  const today = todayIso();
  const flags = [...eventFlags(events, inquiries, today), ...prFlags(pr, events, today)].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
  );
  return { events, inquiries, leads, pr, today, flags };
}
