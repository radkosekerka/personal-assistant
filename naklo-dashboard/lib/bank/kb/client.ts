/**
 * Klient KB API: Account Direct Access (ADAA) pro firemní účty u Komerční banky.
 * Jen čtení: seznam účtů, zůstatky, pohyby. Platby (scope bpisp) se nikdy nežádají.
 *
 * Postup podle https://github.com/komercka/adaa-client/wiki:
 *  1. Software statement (jednorázově, kvalifikovaný certifikát) → scripts/kb-software-statement.ts
 *  2. Registrace aplikace u klienta KB → registrationUrl() → KB vrátí šifrovaná data → decryptRegistration()
 *  3. Autorizační kód → authorizeUrl() → exchangeCode() → refresh token (12 měsíců)
 *  4. Access token (3 minuty) z refresh tokenu → volání ADAA
 */
import { createDecipheriv, randomBytes, randomUUID } from "node:crypto";

export interface KbConfig {
  /** Brána KB API. Sandbox: https://api-gateway.kb.cz/sandbox */
  apiBase: string;
  loginUrl: string;
  apiKeyOauth: string;
  apiKeyAdaa: string;
  softwareStatement: string;
  /** Kam KB vrátí autorizační kód (musí být v software statementu v redirectUris). */
  redirectUri: string;
  appName: string;
}

export function kbConfigFromEnv(env = process.env): KbConfig {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`${k} není nastavené`);
    return v;
  };
  return {
    apiBase: env.KB_API_BASE || "https://api-gateway.kb.cz",
    loginUrl: env.KB_LOGIN_URL || "https://login.kb.cz/autfe/ssologin",
    apiKeyOauth: need("KB_API_KEY_OAUTH"),
    apiKeyAdaa: need("KB_API_KEY_ADAA"),
    softwareStatement: need("KB_SOFTWARE_STATEMENT"),
    redirectUri: need("KB_REDIRECT_URI"),
    appName: env.KB_APP_NAME || "Náklo Dashboard",
  };
}

/* ───────── typy odpovědí ADAA v2 ───────── */

export interface KbAmount {
  value: number;
  currency: string;
}

export interface KbAccount {
  accountId: string;
  iban: string;
  currency: string;
  nameI18N?: string;
  productI18N?: string;
}

export interface KbBalance {
  type: "CLOSING_AVAILABLE" | "PREVIOUSLY_CLOSED_BOOK" | string;
  creditDebitIndicator: "CREDIT" | "DEBIT";
  amount: KbAmount;
  validAt?: string;
  creditLine?: KbAmount;
}

export interface KbTransaction {
  lastUpdated?: string;
  entryReference?: string;
  iban?: string;
  creditDebitIndicator: "CREDIT" | "DEBIT";
  transactionType?: string;
  bankTransactionCode?: { code?: string; issuer?: string };
  amount: KbAmount;
  bookingDate?: string;
  valueDate?: string;
  instructed?: KbAmount;
  reversalIndicator?: boolean;
  status: "BOOK" | "PDNG";
  counterParty?: { iban?: string; name?: string; accountNo?: string; bankBic?: string; bankCode?: string; bankName?: string };
  references?: {
    accountServicer?: string;
    endToEndIdentification?: string;
    variable?: string;
    constant?: string;
    specific?: string;
    receiver?: string;
    myDescription?: string;
  };
  additionalTransactionInformation?: string;
  cardTransactionDetails?: { holdExpirationDate?: string };
}

interface KbPage<T> {
  content: T[];
  totalPages: number;
  pageNumber: number;
  last: boolean;
}

export interface KbRegistration {
  client_id: string;
  client_secret: string;
  scopes?: string[];
  state?: string;
}

export interface KbTokens {
  refreshToken: string;
  /** Kdy refresh token vyprší (z JWT, jinak +12 měsíců). */
  refreshExpiresAt: Date;
}

export class KbApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

/* ───────── registrace a OAuth2 (čisté funkce) ───────── */

/** Nový AES-256 klíč pro registraci (KB jím zašifruje client_id a client_secret). */
export function newRegistrationKey(): string {
  return randomBytes(32).toString("base64");
}

export function registrationUrl(cfg: KbConfig, encryptionKey: string, state: string): string {
  const req = {
    clientName: cfg.appName,
    clientNameEn: cfg.appName,
    applicationType: "web",
    redirectUris: [cfg.redirectUri],
    // Jen čtení účtů. Žádné bpisp (platby) ani card_data.
    scope: ["adaa"],
    encryptionKey,
    encryptionAlg: "AES-256",
    softwareStatement: cfg.softwareStatement,
  };
  const u = new URL(`${cfg.apiBase}/client-registration-ui/v2/saml/register`);
  u.searchParams.set("registrationRequest", Buffer.from(JSON.stringify(req), "utf8").toString("base64"));
  u.searchParams.set("state", state);
  return u.toString();
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Rozšifruje data, která KB po registraci pošle na registrationBackUri (AES/GCM, tag na konci). */
export function decryptRegistration(encryptionKey: string, salt: string, encryptedData: string): KbRegistration {
  const data = b64url(encryptedData);
  const d = createDecipheriv("aes-256-gcm", Buffer.from(encryptionKey, "base64"), b64url(salt));
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]).toString("utf8");
  const json = JSON.parse(plain) as KbRegistration;
  if (!json.client_id || !json.client_secret) throw new Error("Registrace KB nevrátila client_id/client_secret");
  return json;
}

export function authorizeUrl(cfg: KbConfig, clientId: string, state: string): string {
  const u = new URL(cfg.loginUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", "adaa");
  u.searchParams.set("state", state);
  return u.toString();
}

/** Expirace z JWT (bez ověření podpisu, jen pro připomínku obnovy souhlasu). */
export function jwtExpiry(token: string, fallbackDays = 365): Date {
  try {
    const payload = JSON.parse(b64url(token.split(".")[1]).toString("utf8")) as { exp?: number };
    if (payload.exp) return new Date(payload.exp * 1000);
  } catch {
    /* není JWT */
  }
  return new Date(Date.now() + fallbackDays * 86400_000);
}

/* ───────── volání API ───────── */

type Fetch = typeof fetch;

export class KbClient {
  private access?: { token: string; until: number };

  constructor(
    private readonly cfg: KbConfig,
    private readonly creds: { clientId: string; clientSecret: string; refreshToken?: string },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async call(url: string, init: RequestInit & { apiKey: string }): Promise<Response> {
    const { apiKey, headers, ...rest } = init;
    const res = await this.fetchImpl(url, {
      ...rest,
      headers: { "x-correlation-id": randomUUID(), apiKey, ...(headers as Record<string, string>) },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new KbApiError(`KB API ${res.status} ${new URL(url).pathname}`, res.status, body.slice(0, 500));
    }
    return res;
  }

  private tokenRequest(params: Record<string, string>) {
    return this.call(`${this.cfg.apiBase}/oauth2/v3/access_token`, {
      method: "POST",
      apiKey: this.cfg.apiKeyOauth,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
        redirect_uri: this.cfg.redirectUri,
        ...params,
      }).toString(),
    }).then((r) => r.json() as Promise<{ access_token?: string; refresh_token?: string; expires_in?: number }>);
  }

  /** Autorizační kód (platí 2 minuty) → refresh token na 12 měsíců. */
  async exchangeCode(code: string): Promise<KbTokens> {
    const r = await this.tokenRequest({ grant_type: "authorization_code", code });
    if (!r.refresh_token) throw new Error("KB nevrátila refresh token");
    this.creds.refreshToken = r.refresh_token;
    if (r.access_token) this.access = { token: r.access_token, until: Date.now() + 150_000 };
    return { refreshToken: r.refresh_token, refreshExpiresAt: jwtExpiry(r.refresh_token) };
  }

  /** Access token platí 3 minuty; používá se opakovaně, aby KB nevracela 429. */
  async accessToken(): Promise<string> {
    if (this.access && Date.now() < this.access.until) return this.access.token;
    if (!this.creds.refreshToken) throw new Error("Chybí refresh token, propojení je potřeba autorizovat");
    const r = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: this.creds.refreshToken });
    if (!r.access_token) throw new Error("KB nevrátila access token");
    const ttl = Math.max(30, (r.expires_in ?? 180) - 30) * 1000;
    this.access = { token: r.access_token, until: Date.now() + ttl };
    return r.access_token;
  }

  private async get<T>(path: string): Promise<T> {
    const token = await this.accessToken();
    const r = await this.call(`${this.cfg.apiBase}/adaa/v2${path}`, {
      method: "GET",
      apiKey: this.cfg.apiKeyAdaa,
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await r.json()) as T;
  }

  listAccounts(): Promise<KbAccount[]> {
    return this.get<KbAccount[]>("/accounts");
  }

  balances(accountId: string): Promise<KbBalance[]> {
    return this.get<KbBalance[]>(`/accounts/${encodeURIComponent(accountId)}/balances`);
  }

  /**
   * Pohyby za období (max. 2 roky zpět). KB povolí stažení historie jednou za 61 minut
   * a další stránku je nutné stáhnout do 10 s od předchozí, proto stránky jdou hned za sebou.
   */
  async transactions(accountId: string, from: Date, to: Date = new Date()): Promise<KbTransaction[]> {
    const out: KbTransaction[] = [];
    for (let page = 0; page < 200; page++) {
      const q = new URLSearchParams({
        fromDateTime: from.toISOString(),
        toDateTime: to.toISOString(),
        size: "100",
        page: String(page),
      });
      const r = await this.get<KbPage<KbTransaction>>(`/accounts/${encodeURIComponent(accountId)}/transactions?${q}`);
      out.push(...(r.content ?? []));
      if (r.last || !r.content?.length || page + 1 >= (r.totalPages ?? 0)) break;
    }
    return out;
  }
}
