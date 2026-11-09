import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;
const g = globalThis as unknown as { wsnHrDb?: Db; wsnHrPg?: ReturnType<typeof postgres> };

/** Líně vytvořené spojení, aby build nepotřeboval DATABASE_URL. */
export function getDb(): Db {
  if (!g.wsnHrDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL není nastavené");
    // Cloud Run + Cloud SQL: spojení přes unix socket /cloudsql/PROJEKT:REGION:INSTANCE
    const socketDir = process.env.DATABASE_SOCKET_DIR;
    g.wsnHrPg = postgres(url, { max: 5, ...(socketDir ? { path: `${socketDir}/.s.PGSQL.5432` } : {}) });
    g.wsnHrDb = drizzle(g.wsnHrPg, { schema });
  }
  return g.wsnHrDb;
}

export async function closeDb() {
  await g.wsnHrPg?.end();
  g.wsnHrPg = undefined;
  g.wsnHrDb = undefined;
}

export { schema };
