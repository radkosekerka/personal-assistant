import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Snapshot } from "./checks";
import { runChecks, DEFAULT_SETTINGS, type Flag } from "./checks";
import { todayIso } from "./dates";

export async function loadSnapshot(): Promise<Snapshot> {
  const db = getDb();
  const [people, contracts, workMonths, payments, invoices, trainings, trainingRequirements, staffingNeeds] =
    await Promise.all([
      db.select().from(schema.people).orderBy(asc(schema.people.fullName)),
      db.select().from(schema.contracts),
      db.select().from(schema.workMonths),
      db.select().from(schema.payments),
      db.select().from(schema.invoices),
      db.select().from(schema.trainings),
      db.select().from(schema.trainingRequirements),
      db.select().from(schema.staffingNeeds),
    ]);
  return { people, contracts, workMonths, payments, invoices, trainings, trainingRequirements, staffingNeeds };
}

export async function loadCompanies() {
  return getDb().select().from(schema.companies);
}

export async function loadTasks() {
  return getDb().select().from(schema.tasks).orderBy(asc(schema.tasks.status), desc(schema.tasks.createdAt));
}

export async function loadPerson(id: number) {
  const db = getDb();
  const [p] = await db.select().from(schema.people).where(eq(schema.people.id, id));
  return p;
}

export async function dashboardData() {
  const [snapshot, tasks, companies] = await Promise.all([loadSnapshot(), loadTasks(), loadCompanies()]);
  const today = todayIso();
  const flags: Flag[] = runChecks(snapshot, today, DEFAULT_SETTINGS);
  return { snapshot, tasks, companies, flags, today };
}
