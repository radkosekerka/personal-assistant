/**
 * Synchronizace modulu Events z tabulky „Event Form 2026“ (jen čtení z tabulky).
 * Použití: EVENTS_SHEET_ID=... npm run sync:events
 */
import { sql } from "drizzle-orm";
import { closeDb, getDb, schema } from "../lib/db";
import { readSheet } from "../lib/google/sheets";
import { markAnswered, parseInquiries, parseLeads, parsePronajmy } from "../lib/events/parse";

async function main() {
  const id = process.env.EVENTS_SHEET_ID;
  if (!id) throw new Error("EVENTS_SHEET_ID není nastavené");
  const db = getDb();

  const events = parsePronajmy(await readSheet(id, "Pronájmy / Akce"));
  const inquiries = markAnswered(
    [
      ...parseInquiries(await readSheet(id, "Solidpixels"), "Solidpixels"),
      ...parseInquiries(await readSheet(id, "New-web"), "New-web"),
    ],
    events,
  );
  const leads = parseLeads(await readSheet(id, "Leady"));

  for (const e of events) {
    await db.insert(schema.events).values(e).onConflictDoUpdate({
      target: schema.events.sourceKey,
      set: { ...e, syncedAt: sql`now()` },
    });
  }
  for (const q of inquiries) {
    await db.insert(schema.inquiries).values(q).onConflictDoUpdate({ target: schema.inquiries.sourceKey, set: q });
  }
  for (const l of leads) {
    await db.insert(schema.leads).values(l).onConflictDoUpdate({ target: schema.leads.sourceKey, set: l });
  }
  await db.insert(schema.auditLog).values({
    actor: "sync:events",
    action: "sync.events.sheet",
    detail: `${events.length} akcí, ${inquiries.length} poptávek, ${leads.length} leadů`,
  });
  console.log(`Akce ${events.length}, poptávky ${inquiries.length}, leady ${leads.length}`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
