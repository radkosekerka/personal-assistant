import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { todayIso } from "../dates";
import { buildDay } from "./plan";

export async function botData() {
  const db = getDb();
  const today = todayIso();
  const [tasks, owners, briefRows, outbox] = await Promise.all([
    db.select().from(schema.tasks).orderBy(asc(schema.tasks.status), desc(schema.tasks.createdAt)),
    db.select().from(schema.owners).orderBy(asc(schema.owners.id)),
    db.select().from(schema.briefs).orderBy(desc(schema.briefs.date)).limit(1),
    db.select().from(schema.outbox).where(eq(schema.outbox.date, today)).orderBy(asc(schema.outbox.ownerId)),
  ]);
  const open = tasks.filter((t) => t.status === "open");
  const day = buildDay(open, owners, today, { closedToday: 0, createdToday: 0 });
  return { today, tasks, open, owners, brief: briefRows[0] ?? null, outbox, day };
}
