import { sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Person } from "./db/schema";
import type { KiloMayoMonthHours } from "./kilomayo/client";

export interface HoursRow {
  /** ID člena v KiloMayo, nebo prázdné při ručním CSV. */
  memberId?: string;
  /** Jméno pro párování, když chybí memberId. */
  name?: string;
  month: string;
  hours: number;
  shifts: number;
}

export interface HoursPlan {
  upserts: { personId: number; month: string; hours: number; shifts: number }[];
  /** Řádky, které nejde přiřadit k nikomu v evidenci: nový člověk bez záznamu = red flag. */
  unmatched: HoursRow[];
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Spáruje řádky hodin s lidmi v evidenci: nejdřív podle KiloMayo ID, pak podle jména. */
export function planHours(people: Person[], rows: HoursRow[]): HoursPlan {
  const byMember = new Map(people.filter((p) => p.kilomayoMemberId).map((p) => [p.kilomayoMemberId!, p]));
  const byName = new Map<string, Person[]>();
  for (const p of people) {
    const k = norm(p.fullName);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const plan: HoursPlan = { upserts: [], unmatched: [] };
  for (const r of rows) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) || !Number.isFinite(r.hours) || r.hours < 0) {
      plan.unmatched.push(r);
      continue;
    }
    let p = r.memberId ? byMember.get(r.memberId) : undefined;
    if (!p && r.name) {
      const hits = byName.get(norm(r.name)) ?? [];
      if (hits.length === 1) p = hits[0];
    }
    if (!p) plan.unmatched.push(r);
    else plan.upserts.push({ personId: p.id, month: r.month, hours: r.hours, shifts: r.shifts });
  }
  return plan;
}

export function fromKiloMayo(rows: KiloMayoMonthHours[]): HoursRow[] {
  return rows.map((r) => ({ memberId: r.memberId, month: r.month, hours: r.hours, shifts: r.shifts }));
}

export async function applyHours(plan: HoursPlan, source: "kilomayo" | "csv", actor: string) {
  const db = getDb();
  for (const u of plan.upserts) {
    await db
      .insert(schema.workMonths)
      .values({ ...u, source })
      .onConflictDoUpdate({
        target: [schema.workMonths.personId, schema.workMonths.month],
        set: { hours: u.hours, shifts: u.shifts, source, syncedAt: sql`now()` },
      });
  }
  for (const r of plan.unmatched) {
    const who = r.name ?? r.memberId ?? "?";
    await db
      .insert(schema.tasks)
      .values({
        title: `Neznámý člověk v hodinách: ${who}`,
        detail: `${r.month}: ${r.hours} h. Doplnit do evidence a zkontrolovat smlouvu.`,
        flagKey: `UNMATCHED_HOURS:${who}:${r.month}`,
      })
      .onConflictDoNothing();
  }
  await db.insert(schema.auditLog).values({
    actor,
    action: `sync.hours.${source}`,
    detail: `${plan.upserts.length} řádků, ${plan.unmatched.length} nespárovaných`,
  });
}
