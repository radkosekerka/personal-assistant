import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { todayIso } from "../dates";
import { MODULES } from "../modules";
import { unitFlags, UNITS, type Unit } from "./index";

export const unitLabel = (u: Unit) => MODULES.find((m) => m.key === u)?.name ?? u;

export async function unitData(unit: Unit) {
  const db = getDb();
  const [tx, counts] = await Promise.all([
    db.select().from(schema.transactions).where(eq(schema.transactions.unit, unit)).orderBy(desc(schema.transactions.date)),
    db.select().from(schema.cashCounts).where(eq(schema.cashCounts.unit, unit)).orderBy(desc(schema.cashCounts.date)),
  ]);
  const today = todayIso();
  return { tx, counts, today, flags: unitFlags(unit, unitLabel(unit), tx, counts, today) };
}

export async function allUnitsData() {
  return Object.fromEntries(await Promise.all(UNITS.map(async (u) => [u, await unitData(u)] as const))) as Record<
    Unit,
    Awaited<ReturnType<typeof unitData>>
  >;
}
