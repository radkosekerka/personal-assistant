/**
 * Import odpracovaných hodin z CSV (záloha, dokud nejede synchronizace s KiloMayo).
 * Použití: npm run import:hours -- cesta/k/souboru.csv
 * Sloupce: jmeno (nebo kilomayo_id); mesic (YYYY-MM); hodiny; smeny (volitelné)
 */
import { readFileSync } from "node:fs";
import { parseCsv, parseNumber } from "../lib/csv";
import { closeDb, getDb, schema } from "../lib/db";
import { applyHours, planHours } from "../lib/sync";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Zadej cestu k CSV");
  const rows = parseCsv(readFileSync(file, "utf8")).map((r) => ({
    memberId: r["kilomayo_id"] || undefined,
    name: r["jmeno"] || r["jméno"] || undefined,
    month: r["mesic"] || r["měsíc"],
    hours: parseNumber(r["hodiny"]),
    shifts: Math.round(parseNumber(r["smeny"] || r["směny"]) || 0),
  }));
  const people = await getDb().select().from(schema.people);
  const plan = planHours(people, rows);
  await applyHours(plan, "csv", `cli:${process.env.USER ?? "?"}`);
  console.log(`Nahráno ${plan.upserts.length} řádků, ${plan.unmatched.length} nespárovaných (vznikly úkoly).`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
