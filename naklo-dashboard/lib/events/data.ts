import { asc, desc } from "drizzle-orm";
import { getDb, schema } from "../db";
import { todayIso } from "../dates";
import { eventFlags } from "./checks";

export async function eventsData() {
  const db = getDb();
  const [events, inquiries, leads] = await Promise.all([
    db.select().from(schema.events).orderBy(asc(schema.events.startDate)),
    db.select().from(schema.inquiries).orderBy(desc(schema.inquiries.receivedAt)),
    db.select().from(schema.leads),
  ]);
  const today = todayIso();
  return { events, inquiries, leads, today, flags: eventFlags(events, inquiries, today) };
}
