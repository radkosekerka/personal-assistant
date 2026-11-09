/** Ruční stažení zůstatků a pohybů ze všech propojení: npm run sync:bank */
import { closeDb } from "../lib/db";
import { syncAllBanks } from "../lib/bank/sync";

syncAllBanks("cli")
  .then((r) => console.table(r))
  .finally(closeDb);
