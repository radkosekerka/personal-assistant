import { defineConfig } from "drizzle-kit";

/** Na Cloud Run se k Cloud SQL připojujeme přes unix socket (DATABASE_SOCKET_DIR=/cloudsql/PROJEKT:REGION:INSTANCE). */
function credentials() {
  const url = process.env.DATABASE_URL!;
  const socketDir = process.env.DATABASE_SOCKET_DIR;
  if (!socketDir) return { url };
  const u = new URL(url);
  return {
    host: socketDir,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    ssl: false,
  };
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: credentials(),
});
