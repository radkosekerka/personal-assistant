import { asc, desc, gte } from "drizzle-orm";
import { getDb, schema } from "../db";
import { addDays, todayIso } from "../dates";
import { bankFlags } from "./checks";

/** Data pro modul Finance: propojení, účty, pohyby za posledních ~13 měsíců a red flags. */
export async function bankData() {
  const db = getDb();
  const today = todayIso();
  const [connections, accounts, tx, companies] = await Promise.all([
    db.select().from(schema.bankConnections).orderBy(asc(schema.bankConnections.id)),
    db.select().from(schema.bankAccounts).orderBy(asc(schema.bankAccounts.companyId), asc(schema.bankAccounts.iban)),
    db
      .select()
      .from(schema.bankTransactions)
      .where(gte(schema.bankTransactions.valueDate, addDays(today, -400)))
      .orderBy(desc(schema.bankTransactions.valueDate), desc(schema.bankTransactions.id)),
    db.select().from(schema.companies),
  ]);
  const flags = bankFlags(connections, accounts, tx, new Date(), today);
  return { connections, accounts, tx, companies, flags, today };
}
