/** Ranní běh centrálního bota z příkazové řádky / Cloud Run Job: npm run bot */
import { closeDb } from "../lib/db";
import { runBot } from "../lib/bot/run";

runBot("cron")
  .then((r) => console.log(JSON.stringify(r)))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
