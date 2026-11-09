import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  KbClient,
  authorizeUrl,
  decryptRegistration,
  jwtExpiry,
  newRegistrationKey,
  registrationUrl,
  type KbConfig,
  type KbTransaction,
} from "./kb/client";
import { formatCounterpartyAccount, mapBalances, mapTransaction, syncFrom, txKey } from "./map";
import { bankFlags, cashflow, normAcc, totals } from "./checks";
import { seal, unseal } from "./secrets";
import type { BankAccount, BankConnection, BankTransaction } from "../db/schema";

const cfg: KbConfig = {
  apiBase: "https://kb.test",
  loginUrl: "https://login.kb.test/autfe/ssologin",
  apiKeyOauth: "key-oauth",
  apiKeyAdaa: "key-adaa",
  softwareStatement: "jwt.statement.x",
  redirectUri: "https://dash.test/api/bank/kb/callback",
  appName: "Test",
};

const tx = (o: Partial<KbTransaction> = {}): KbTransaction => ({
  creditDebitIndicator: "DEBIT",
  amount: { value: 1500.5, currency: "CZK" },
  bookingDate: "2026-11-02",
  valueDate: "2026-11-02",
  status: "BOOK",
  transactionType: "DOMESTIC",
  counterParty: { name: " Dodavatel s.r.o. ", accountNo: "0000190000123457", bankCode: "0800" },
  references: { accountServicer: "abc123", variable: "2026001", receiver: "Faktura 1" },
  ...o,
});

describe("registrace KB", () => {
  it("rozšifruje odpověď KB (AES-256-GCM, tag na konci, base64url)", () => {
    const key = newRegistrationKey();
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
    const plain = JSON.stringify({ client_id: "App-1", client_secret: "s3cret", scopes: ["adaa"] });
    const enc = Buffer.concat([c.update(plain, "utf8"), c.final(), c.getAuthTag()]);
    const reg = decryptRegistration(key, iv.toString("base64url"), enc.toString("base64url"));
    expect(reg.client_id).toBe("App-1");
    expect(reg.client_secret).toBe("s3cret");
    expect(() => decryptRegistration(newRegistrationKey(), iv.toString("base64url"), enc.toString("base64url"))).toThrow();
  });

  it("žádá jen čtení účtů (scope adaa), nikdy platby", () => {
    const u = new URL(registrationUrl(cfg, "k", "st"));
    expect(u.pathname).toBe("/client-registration-ui/v2/saml/register");
    const req = JSON.parse(Buffer.from(u.searchParams.get("registrationRequest")!, "base64").toString("utf8"));
    expect(req.scope).toEqual(["adaa"]);
    expect(req.redirectUris).toEqual([cfg.redirectUri]);
    expect(req.softwareStatement).toBe(cfg.softwareStatement);
    const a = new URL(authorizeUrl(cfg, "App-1", "s2"));
    expect(a.searchParams.get("scope")).toBe("adaa");
    expect(a.searchParams.get("state")).toBe("s2");
  });

  it("čte expiraci refresh tokenu z JWT", () => {
    const exp = Math.floor(Date.UTC(2027, 10, 9) / 1000);
    const jwt = `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
    expect(jwtExpiry(jwt).toISOString().slice(0, 10)).toBe("2027-11-09");
  });
});

describe("převod dat z KB", () => {
  it("výdaj je záporný, klíč je accountServicer, protistrana jako číslo/banka", () => {
    const r = mapTransaction(tx());
    expect(r.amount).toBe(-1500.5);
    expect(r.externalId).toBe("abc123");
    expect(r.counterpartyName).toBe("Dodavatel s.r.o.");
    expect(r.counterpartyAccount).toBe("19-123457/0800");
    expect(r.variableSymbol).toBe("2026001");
    expect(r.message).toBe("Faktura 1");
  });

  it("blokace a zaúčtování mají stejný klíč", () => {
    expect(txKey(tx({ status: "PDNG", bookingDate: undefined }))).toBe(txKey(tx()));
    expect(mapTransaction(tx({ status: "PDNG" })).status).toBe("PDNG");
  });

  it("bez accountServicer vznikne stabilní otisk", () => {
    const t = tx({ references: { variable: "1" }, entryReference: "E1" });
    expect(txKey(t)).toMatch(/^h:/);
    expect(txKey(t)).toBe(txKey({ ...t }));
    expect(txKey(t)).not.toBe(txKey({ ...t, amount: { value: 2, currency: "CZK" } }));
  });

  it("IBAN protistrany, když chybí číslo účtu", () => {
    expect(formatCounterpartyAccount({ iban: "DE89370400440532013000" })).toBe("DE89370400440532013000");
    expect(formatCounterpartyAccount(undefined)).toBeNull();
  });

  it("zůstatky: účetní a disponibilní, debet záporně", () => {
    const b = mapBalances([
      { type: "CLOSING_AVAILABLE", creditDebitIndicator: "CREDIT", amount: { value: 900, currency: "CZK" }, validAt: "2026-11-09T08:00:00Z", creditLine: { value: 0, currency: "CZK" } },
      { type: "PREVIOUSLY_CLOSED_BOOK", creditDebitIndicator: "DEBIT", amount: { value: 100, currency: "CZK" } },
    ]);
    expect(b).toMatchObject({ availableBalance: 900, bookedBalance: -100, creditLine: 0 });
    expect(b.balanceAt?.toISOString()).toBe("2026-11-09T08:00:00.000Z");
  });

  it("odkud stahovat: poprvé rok zpět, pak od posledního zaúčtování s rezervou, nejvýš 2 roky", () => {
    const now = new Date("2026-11-09T10:00:00Z");
    expect(syncFrom(null, now).toISOString().slice(0, 10)).toBe("2025-11-09");
    expect(syncFrom("2026-11-05", now).toISOString().slice(0, 10)).toBe("2026-10-26");
    expect(syncFrom("2020-01-01", now).getTime()).toBeGreaterThan(new Date("2024-11-01").getTime());
  });
});

describe("KbClient", () => {
  it("posílá API klíče, recykluje access token a stránkuje pohyby", async () => {
    const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const fake = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: init?.headers as Record<string, string>, body: init?.body as string });
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (url.endsWith("/oauth2/v3/access_token")) return json({ access_token: "AT", expires_in: 179 });
      if (url.includes("/transactions")) {
        const page = Number(new URL(url).searchParams.get("page"));
        return json({ content: [tx({ references: { accountServicer: `p${page}` } })], totalPages: 2, pageNumber: page, last: page === 1 });
      }
      if (url.endsWith("/accounts")) return json([{ accountId: "A1", iban: "CZ65", currency: "CZK" }]);
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    const kb = new KbClient(cfg, { clientId: "c", clientSecret: "s", refreshToken: "RT" }, fake);
    expect(await kb.listAccounts()).toHaveLength(1);
    const list = await kb.transactions("A1", new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(list.map((t) => t.references?.accountServicer)).toEqual(["p0", "p1"]);
    const tokenCalls = calls.filter((c) => c.url.endsWith("access_token"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].headers.apiKey).toBe("key-oauth");
    expect(tokenCalls[0].body).toContain("grant_type=refresh_token");
    const adaa = calls.filter((c) => c.url.includes("/adaa/v2/"));
    expect(adaa.every((c) => c.headers.apiKey === "key-adaa" && c.headers.Authorization === "Bearer AT")).toBe(true);
    expect(adaa.every((c) => !!c.headers["x-correlation-id"])).toBe(true);
    await expect(kb.balances("X")).rejects.toThrow(/404/);
  });
});

describe("tajemství v DB", () => {
  it("šifruje a dešifruje", () => {
    process.env.BANK_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const s = seal("refresh-token");
    expect(s).not.toContain("refresh-token");
    expect(unseal(s)).toBe("refresh-token");
  });
});

/* ───────── přehledy a red flags ───────── */

const conn = (o: Partial<BankConnection> = {}): BankConnection => ({
  id: 1,
  provider: "kb_adaa",
  label: "WSN",
  companyId: 1,
  status: "aktivni",
  registrationKeyEnc: null,
  oauthState: null,
  clientId: "c",
  clientSecretEnc: "x",
  refreshTokenEnc: "x",
  refreshTokenExpiresAt: new Date("2027-06-01T00:00:00Z"),
  lastSyncAt: new Date("2026-11-09T04:30:00Z"),
  lastError: null,
  createdBy: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  ...o,
});

const acc = (o: Partial<BankAccount> = {}): BankAccount => ({
  id: 1,
  connectionId: 1,
  companyId: 1,
  externalId: "A1",
  iban: "CZ6501000000190000123457",
  currency: "CZK",
  name: "Provozní",
  product: null,
  bookedBalance: 100000,
  availableBalance: 90000,
  creditLine: 0,
  balanceAt: null,
  lowBalanceLimit: null,
  active: true,
  ...o,
});

let txId = 0;
const btx = (o: Partial<BankTransaction> = {}): BankTransaction => ({
  id: ++txId,
  accountId: 1,
  externalId: `t${txId}`,
  status: "BOOK",
  bookingDate: "2026-11-08",
  valueDate: "2026-11-08",
  amount: -1000,
  currency: "CZK",
  type: "DOMESTIC",
  counterpartyName: "Někdo",
  counterpartyAccount: null,
  variableSymbol: null,
  constantSymbol: null,
  specificSymbol: null,
  message: null,
  note: null,
  category: null,
  syncedAt: new Date(),
  ...o,
});

describe("bankFlags", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  const today = "2026-11-09";

  it("v pořádku = žádné flagy", () => {
    expect(bankFlags([conn()], [acc()], [btx()], now, today)).toEqual([]);
  });

  it("nízký zůstatek je kritický", () => {
    const f = bankFlags([conn()], [acc({ lowBalanceLimit: 100000 })], [], now, today);
    expect(f.map((x) => [x.key.split(":")[0], x.severity])).toEqual([["BANK_LOW", "critical"]]);
  });

  it("souhlas brzy vyprší / vypršel", () => {
    expect(bankFlags([conn({ refreshTokenExpiresAt: new Date("2026-11-20T00:00:00Z") })], [], [], now, today)[0].key).toMatch(/^BANK_CONSENT_SOON/);
    expect(bankFlags([conn({ refreshTokenExpiresAt: new Date("2026-11-01T00:00:00Z") })], [], [], now, today)[0].severity).toBe("critical");
  });

  it("stará data a chyba synchronizace", () => {
    const keys = bankFlags([conn({ lastSyncAt: new Date("2026-11-05T00:00:00Z") }), conn({ id: 2, status: "chyba", lastError: "500" })], [], [], now, today).map((f) => f.key.split(":")[0]);
    expect(keys).toEqual(["BANK_ERROR", "BANK_STALE"]);
  });

  it("velká odchozí platba za poslední dny", () => {
    const f = bankFlags([conn()], [acc()], [btx({ amount: -150000 }), btx({ amount: -150000, bookingDate: "2026-10-01" }), btx({ amount: 150000 })], now, today);
    expect(f).toHaveLength(1);
    expect(f[0].title).toContain("150");
  });
});

describe("přehledy", () => {
  it("součty po měnách, neaktivní účty se nepočítají", () => {
    const t = totals([acc(), acc({ id: 2, availableBalance: 10, bookedBalance: 10 }), acc({ id: 3, currency: "EUR", availableBalance: 5, bookedBalance: 5 }), acc({ id: 4, active: false })]);
    expect(t).toEqual([
      { currency: "CZK", booked: 100010, available: 90010 },
      { currency: "EUR", booked: 5, available: 5 },
    ]);
  });

  it("cashflow bez převodů mezi vlastními účty a bez blokací", () => {
    const rows = cashflow(
      [
        btx({ amount: 5000, bookingDate: "2026-11-02" }),
        btx({ amount: -2000, bookingDate: "2026-11-03" }),
        btx({ amount: -3000, bookingDate: "2026-11-04", counterpartyAccount: "19-123457/0100" }),
        btx({ amount: -700, status: "PDNG", bookingDate: null }),
        btx({ amount: 100, bookingDate: "2026-10-15" }),
      ],
      ["CZ6501000000190000123457"],
      "2026-11",
      2,
    );
    expect(rows).toEqual([
      { month: "2026-10", income: 100, costs: 0, net: 100 },
      { month: "2026-11", income: 5000, costs: 2000, net: 3000 },
    ]);
  });

  it("normAcc sjednotí IBAN a domácí formát", () => {
    expect(normAcc("CZ65 0100 0000 1900 0012 3457")).toBe("19-123457/0100");
    expect(normAcc("000019-0000123457/0100")).toBe("19-123457/0100");
    expect(normAcc("123457/0100")).toBe("-123457/0100");
  });
});
