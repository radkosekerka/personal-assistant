/**
 * Denní synchronizace hodin z KiloMayo (jen čtení).
 * Zatím kostra: chybí čtení magic linku z Gmailu a těla dotazů, viz lib/kilomayo/client.ts.
 */
import { closeDb, getDb, schema } from "../lib/db";
import { KiloMayoHttp, type MagicLinkReader } from "../lib/kilomayo/client";
import { applyHours, fromKiloMayo, planHours } from "../lib/sync";
import { addMonths, monthOf, todayIso } from "../lib/dates";

const notYet: MagicLinkReader = {
  async waitForLink() {
    throw new Error("Čtení magic linku z info@ ještě není napojené (Gmail API + servisní účet)");
  },
};

async function main() {
  const km = new KiloMayoHttp(
    process.env.KILOMAYO_BASE_URL ?? "https://naklo.kilomayo.app",
    process.env.KILOMAYO_LOGIN_EMAIL ?? "info@wakesurfnaklo.cz",
    notYet,
  );
  await km.login();
  const thisMonth = monthOf(todayIso());
  const people = await getDb().select().from(schema.people);
  for (const m of [addMonths(thisMonth, -1), thisMonth]) {
    const plan = planHours(people, fromKiloMayo(await km.monthlyHours(m)));
    await applyHours(plan, "kilomayo", "sync:kilomayo");
    console.log(`${m}: ${plan.upserts.length} řádků, ${plan.unmatched.length} nespárovaných`);
  }
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
