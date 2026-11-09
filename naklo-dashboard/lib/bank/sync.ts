/** Propojení s KB a synchronizace účtů do DB. Jen čtení z banky. */
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { BankConnection } from "../db/schema";
import {
  KbApiError,
  KbClient,
  authorizeUrl,
  decryptRegistration,
  kbConfigFromEnv,
  newRegistrationKey,
  registrationUrl,
  type KbConfig,
} from "./kb/client";
import { mapBalances, mapTransaction, syncFrom } from "./map";
import { seal, unseal } from "./secrets";

const audit = (actor: string, action: string, detail?: string) =>
  getDb().insert(schema.auditLog).values({ actor, action, detail });

/* ───────── propojení (registrace + autorizace) ───────── */

/** Krok 1: založí propojení a vrátí URL, kam poslat prohlížeč (přihlášení do KB a výběr účtů). */
export async function startKbConnection(label: string, companyId: number | null, actor: string): Promise<string> {
  const cfg = kbConfigFromEnv();
  const key = newRegistrationKey();
  const state = randomBytes(16).toString("hex");
  const [c] = await getDb()
    .insert(schema.bankConnections)
    .values({ label, companyId, status: "registrace", registrationKeyEnc: seal(key), oauthState: state, createdBy: actor })
    .returning();
  await audit(actor, "bank.kb.start", `propojení ${c.id}: ${label}`);
  return registrationUrl(cfg, key, state);
}

/**
 * Krok 2: KB vrátí na registrationBackUri šifrovaná data s client_id a client_secret.
 * Najde propojení podle state, případně zkusí klíče všech rozpracovaných registrací (GCM pozná špatný klíč).
 * Vrací URL pro autorizační kód.
 */
export async function completeKbRegistration(salt: string, encryptedData: string, state: string | null, actor: string): Promise<string> {
  const cfg = kbConfigFromEnv();
  const db = getDb();
  const pending = await db
    .select()
    .from(schema.bankConnections)
    .where(and(eq(schema.bankConnections.status, "registrace"), isNotNull(schema.bankConnections.registrationKeyEnc)))
    .orderBy(desc(schema.bankConnections.createdAt));
  const ordered = state ? [...pending.filter((p) => p.oauthState === state), ...pending.filter((p) => p.oauthState !== state)] : pending;
  for (const c of ordered) {
    let reg;
    try {
      reg = decryptRegistration(unseal(c.registrationKeyEnc!), salt, encryptedData);
    } catch {
      continue;
    }
    const newState = randomBytes(16).toString("hex");
    await db
      .update(schema.bankConnections)
      .set({
        status: "autorizace",
        clientId: reg.client_id,
        clientSecretEnc: seal(reg.client_secret),
        registrationKeyEnc: null,
        oauthState: newState,
      })
      .where(eq(schema.bankConnections.id, c.id));
    await audit(actor, "bank.kb.registered", `propojení ${c.id}, client ${reg.client_id}`);
    return authorizeUrl(cfg, reg.client_id, newState);
  }
  throw new Error("Registraci z KB se nepodařilo spárovat s žádným rozpracovaným propojením");
}

/** Krok 3: autorizační kód → refresh token. Pak hned první synchronizace. */
export async function completeKbAuthorization(code: string, state: string, actor: string): Promise<BankConnection> {
  const cfg = kbConfigFromEnv();
  const db = getDb();
  const [c] = await db.select().from(schema.bankConnections).where(eq(schema.bankConnections.oauthState, state));
  if (!c || !c.clientId || !c.clientSecretEnc) throw new Error("Neznámý nebo prošlý požadavek na autorizaci");
  const kb = new KbClient(cfg, { clientId: c.clientId, clientSecret: unseal(c.clientSecretEnc) });
  const t = await kb.exchangeCode(code);
  const [upd] = await db
    .update(schema.bankConnections)
    .set({
      status: "aktivni",
      refreshTokenEnc: seal(t.refreshToken),
      refreshTokenExpiresAt: t.refreshExpiresAt,
      oauthState: null,
      lastError: null,
    })
    .where(eq(schema.bankConnections.id, c.id))
    .returning();
  await audit(actor, "bank.kb.authorized", `propojení ${c.id}, platí do ${t.refreshExpiresAt.toISOString().slice(0, 10)}`);
  await syncConnection(upd, actor, { kb, cfg }).catch(() => undefined);
  return upd;
}

/** Obnova souhlasu po 12 měsících: stačí nový autorizační kód, registrace zůstává. */
export async function renewKbConsent(connectionId: number, actor: string): Promise<string> {
  const cfg = kbConfigFromEnv();
  const db = getDb();
  const [c] = await db.select().from(schema.bankConnections).where(eq(schema.bankConnections.id, connectionId));
  if (!c?.clientId) throw new Error("Propojení nemá dokončenou registraci");
  const state = randomBytes(16).toString("hex");
  await db.update(schema.bankConnections).set({ oauthState: state }).where(eq(schema.bankConnections.id, c.id));
  await audit(actor, "bank.kb.renew", `propojení ${c.id}`);
  return authorizeUrl(cfg, c.clientId, state);
}

/* ───────── synchronizace ───────── */

export interface SyncResult {
  connectionId: number;
  accounts: number;
  transactions: number;
  skippedHistory: number;
  error?: string;
}

/** KB pustí stažení historie jednou za 61 minut (bez notifikací). */
const HISTORY_INTERVAL_MS = 61 * 60_000;

export async function syncConnection(
  conn: BankConnection,
  actor: string,
  opts: { kb?: KbClient; cfg?: KbConfig; now?: Date } = {},
): Promise<SyncResult> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const res: SyncResult = { connectionId: conn.id, accounts: 0, transactions: 0, skippedHistory: 0 };
  try {
    if (!conn.clientId || !conn.clientSecretEnc || !conn.refreshTokenEnc) throw new Error("Propojení není autorizované");
    const cfg = opts.cfg ?? kbConfigFromEnv();
    const kb =
      opts.kb ??
      new KbClient(cfg, { clientId: conn.clientId, clientSecret: unseal(conn.clientSecretEnc), refreshToken: unseal(conn.refreshTokenEnc) });

    const historyAllowed = !conn.lastSyncAt || now.getTime() - conn.lastSyncAt.getTime() >= HISTORY_INTERVAL_MS;
    const kbAccounts = await kb.listAccounts();
    for (const ka of kbAccounts) {
      const [acc] = await db
        .insert(schema.bankAccounts)
        .values({
          connectionId: conn.id,
          companyId: conn.companyId,
          externalId: ka.accountId,
          iban: ka.iban,
          currency: ka.currency,
          name: ka.nameI18N ?? null,
          product: ka.productI18N ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.bankAccounts.iban, schema.bankAccounts.currency],
          set: { connectionId: conn.id, externalId: ka.accountId, name: ka.nameI18N ?? null, product: ka.productI18N ?? null },
        })
        .returning();
      res.accounts++;
      if (!acc.active) continue;

      const bal = mapBalances(await kb.balances(ka.accountId));
      await db.update(schema.bankAccounts).set(bal).where(eq(schema.bankAccounts.id, acc.id));

      if (!historyAllowed) {
        res.skippedHistory++;
        continue;
      }
      const [last] = await db
        .select({ d: sql<string | null>`max(${schema.bankTransactions.bookingDate})` })
        .from(schema.bankTransactions)
        .where(and(eq(schema.bankTransactions.accountId, acc.id), eq(schema.bankTransactions.status, "BOOK")));
      const rows = (await kb.transactions(ka.accountId, syncFrom(last?.d, now), now)).map(mapTransaction);
      // Stejný pohyb může přijít jako PDNG i BOOK; poslední verze vyhrává.
      const unique = [...new Map(rows.map((r) => [r.externalId, r])).values()];
      for (const r of unique) {
        await db
          .insert(schema.bankTransactions)
          .values({ ...r, accountId: acc.id })
          .onConflictDoUpdate({
            target: [schema.bankTransactions.accountId, schema.bankTransactions.externalId],
            set: { ...r, syncedAt: sql`now()` },
          });
      }
      // Blokace, které banka už nevrací (zrušené nebo zaúčtované pod jiným ID), smazat.
      const ids = unique.map((r) => r.externalId);
      await db
        .delete(schema.bankTransactions)
        .where(
          and(
            eq(schema.bankTransactions.accountId, acc.id),
            eq(schema.bankTransactions.status, "PDNG"),
            ...(ids.length ? [notInArray(schema.bankTransactions.externalId, ids)] : []),
          ),
        );
      res.transactions += unique.length;
    }
    await db
      .update(schema.bankConnections)
      .set({ status: "aktivni", lastError: null, ...(historyAllowed ? { lastSyncAt: now } : {}) })
      .where(eq(schema.bankConnections.id, conn.id));
    await audit(actor, "sync.bank.kb", `propojení ${conn.id}: ${res.accounts} účtů, ${res.transactions} pohybů`);
  } catch (e) {
    const msg = e instanceof KbApiError ? `${e.message}: ${e.body}` : (e as Error).message;
    // 400/401 z tokenu po roce = vypršelý souhlas.
    const expired = e instanceof KbApiError && /oauth2/.test(e.message) && (e.status === 400 || e.status === 401);
    res.error = msg;
    await db
      .update(schema.bankConnections)
      .set({ status: expired ? "vyprselo" : "chyba", lastError: msg.slice(0, 500) })
      .where(eq(schema.bankConnections.id, conn.id));
    await audit(actor, "sync.bank.kb.error", `propojení ${conn.id}: ${msg.slice(0, 300)}`);
  }
  return res;
}

export async function syncAllBanks(actor: string): Promise<SyncResult[]> {
  const conns = await getDb()
    .select()
    .from(schema.bankConnections)
    .where(inArray(schema.bankConnections.status, ["aktivni", "chyba"]));
  const out: SyncResult[] = [];
  for (const c of conns) out.push(await syncConnection(c, actor));
  return out;
}
