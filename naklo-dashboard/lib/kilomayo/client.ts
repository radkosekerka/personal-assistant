/**
 * Čtecí klient pro KiloMayo (naklo.kilomayo.app).
 *
 * KiloMayo nemá veřejné API. Jeho web ale volá vlastní endpointy, které jsme viděli
 * v síťovém provozu 4. 11. 2026:
 *   POST /api/v1/graphql/auth                     – přihlášení (Contember tenant API)
 *   POST /api/v1/contember/content                – data (Contember content GraphQL)
 *   POST /api/v1/stats/member-monthly-shifts-states – statistiky směn po měsících
 * Přihlášení chodí jako magic link na e-mail (info@wakesurfnaklo.cz).
 *
 * STAV: kostra. Těla dotazů a názvy entit je potřeba jednou odečíst z prohlížeče
 * (DevTools → Network → Payload) a doplnit do QUERIES. Do té doby použij CSV import.
 * Klient nikdy nic nezapisuje, jen čte.
 */

export interface KiloMayoMember {
  id: string;
  name: string;
  email?: string | null;
}

export interface KiloMayoMonthHours {
  memberId: string;
  month: string; // YYYY-MM
  hours: number;
  shifts: number;
}

export interface KiloMayoSource {
  members(): Promise<KiloMayoMember[]>;
  monthlyHours(month: string): Promise<KiloMayoMonthHours[]>;
}

/** Přečte magic link z e-mailu (implementace přes Gmail API se servisním účtem). */
export interface MagicLinkReader {
  waitForLink(sentAfter: Date, timeoutMs: number): Promise<string>;
}

/** Doplnit podle zachyceného provozu. */
export const QUERIES = {
  members: "" as string,
  monthlyHours: "" as string,
};

export class KiloMayoHttp implements KiloMayoSource {
  private cookie: string | null = null;

  constructor(
    private baseUrl: string,
    private email: string,
    private links: MagicLinkReader,
  ) {}

  /** Přihlášení: vyžádá magic link, přečte ho z pošty a otevře, čímž vznikne session cookie. */
  async login(): Promise<void> {
    const started = new Date();
    // Contember tenant API: passwordless přihlášení (název mutace ověřit v provozu).
    await this.post("/api/v1/graphql/auth", {
      query: `mutation($email: String!) { initSignInPasswordless(email: $email) { ok error { code } } }`,
      variables: { email: this.email },
    });
    const link = await this.links.waitForLink(started, 120_000);
    if (!link.startsWith(`${this.baseUrl}/sign/magic-link/`)) {
      throw new Error("Neočekávaný přihlašovací odkaz, končím (ochrana proti podvrženému e-mailu)");
    }
    const res = await fetch(link, { redirect: "manual" });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (!setCookie.length) throw new Error(`KiloMayo nevrátilo session cookie (HTTP ${res.status})`);
    this.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`KiloMayo ${path}: HTTP ${res.status}`);
    return res.json();
  }

  private requireQuery(name: keyof typeof QUERIES): string {
    const q = QUERIES[name];
    if (!q) throw new Error(`KiloMayo dotaz "${name}" ještě není doplněný, viz lib/kilomayo/client.ts`);
    return q;
  }

  async members(): Promise<KiloMayoMember[]> {
    const data = await this.post("/api/v1/contember/content", { query: this.requireQuery("members") });
    throw new Error(`Mapování členů ještě není doplněné: ${JSON.stringify(data).slice(0, 200)}`);
  }

  async monthlyHours(month: string): Promise<KiloMayoMonthHours[]> {
    const data = await this.post("/api/v1/stats/member-monthly-shifts-states", {
      query: this.requireQuery("monthlyHours"),
      month,
    });
    throw new Error(`Mapování hodin ještě není doplněné: ${JSON.stringify(data).slice(0, 200)}`);
  }
}
