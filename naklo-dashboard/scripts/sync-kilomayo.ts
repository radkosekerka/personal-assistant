/**
 * Denní synchronizace z KiloMayo (jen čtení): členové týmu, smlouvy a odpracované hodiny
 * za minulý a tento měsíc. Přihlašuje se heslem z KILOMAYO_PASSWORD (nikdy v repozitáři).
 */
import { closeDb, getDb, schema } from "../lib/db";
import { KiloMayoHttp } from "../lib/kilomayo/client";
import { applyMembers, planMembers } from "../lib/kilomayo/members";
import { applyHours, fromKiloMayo, planHours } from "../lib/sync";
import { addMonths, monthOf, todayIso } from "../lib/dates";

async function main() {
  const password = process.env.KILOMAYO_PASSWORD;
  if (!password) throw new Error("Chybí KILOMAYO_PASSWORD");
  const km = new KiloMayoHttp(
    process.env.KILOMAYO_BASE_URL ?? "https://naklo.kilomayo.app",
    process.env.KILOMAYO_LOGIN_EMAIL ?? "info@wakesurfnaklo.cz",
    password,
  );
  await km.login();
  const today = todayIso();

  const members = await km.members();
  const mPlan = planMembers(await getDb().select().from(schema.people), members, today);
  await applyMembers(mPlan, "sync:kilomayo");
  console.log(
    `Lidé: ${mPlan.create.length} nových, ${mPlan.link.length} spárovaných, ${mPlan.contracts.length} smluv, ${mPlan.skipped.length} přeskočeno`,
  );

  const thisMonth = monthOf(today);
  const rows = await km.monthlyHours(addMonths(thisMonth, -1), thisMonth, members.map((m) => m.id));
  const plan = planHours(await getDb().select().from(schema.people), fromKiloMayo(rows));
  await applyHours(plan, "kilomayo", "sync:kilomayo");
  console.log(`Hodiny: ${plan.upserts.length} řádků, ${plan.unmatched.length} nespárovaných`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
