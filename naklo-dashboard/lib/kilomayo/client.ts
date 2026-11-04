/**
 * Čtecí klient pro KiloMayo (naklo.kilomayo.app).
 *
 * KiloMayo nemá veřejné API. Jeho web volá vlastní endpointy, které jsme 4. 11. 2026
 * zachytili v prohlížeči (přihlášený účet info@, metoda přihlášení „password“):
 *   POST /api/v1/graphql/auth                       – přihlášení (Contember tenant API)
 *   POST /api/v1/contember/content                  – data (Contember content GraphQL)
 *   POST /api/v1/stats/member-monthly-shifts-states – minuty po měsících a lidech
 *
 * Ověřeno v prohlížeči: dotazy MEMBERS a tělo statistik níže vrací data
 * (112 členů; typy smluv HPP, DPP, DPČ, IČ, Stáž).
 * Neověřeno: přihlášení heslem mimo prohlížeč (mutace signIn) – kontejner KiloMayo blokuje.
 * Klient nikdy nic nezapisuje, jen čte.
 */

export interface KiloMayoContract {
  id: string;
  validSince: string | null;
  validUntil: string | null;
  presetName: string | null;
  hourlyWage: number | null;
  monthlyWage: number | null;
}

export interface KiloMayoMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contracts: KiloMayoContract[];
  documentUrl: string | null;
}

export interface KiloMayoMonthHours {
  memberId: string;
  month: string; // YYYY-MM
  hours: number;
  shifts: number;
}

export interface KiloMayoSource {
  members(): Promise<KiloMayoMember[]>;
  monthlyHours(fromMonth: string, toMonth: string, memberIds: string[]): Promise<KiloMayoMonthHours[]>;
}

/** Zachycené dotazy (zjednodušené na pole, která potřebujeme). */
export const QUERIES = {
  members: `query {
    listMember(orderBy: [{ info: { fallbackNameWithLastNameFirst: asc } }]) {
      id
      contactDetail { email phone }
      info { fallbackNameWithLastNameFirst }
      workContracts { id validSince validUntil hourlyWage monthlyWage preset { name } }
      documents { id name url }
    }
  }`,
  signIn: `mutation($email: String!, $password: String!) {
    signIn(email: $email, password: $password, expiration: 3600) { ok error { code } result { token } }
  }`,
};

interface RawMember {
  id: string;
  contactDetail: { email: string | null; phone: string | null } | null;
  info: { fallbackNameWithLastNameFirst: string | null } | null;
  workContracts: {
    id: string;
    validSince: string | null;
    validUntil: string | null;
    hourlyWage: number | string | null;
    monthlyWage: number | string | null;
    preset: { name: string } | null;
  }[];
  documents: { id: string; name: string; url: string }[];
}

const num = (v: number | string | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "Příjmení Jméno" z KiloMayo → "Jméno Příjmení" jako v evidenci. */
export function displayName(lastFirst: string): string {
  const parts = lastFirst.trim().split(/\s+/);
  return parts.length < 2 ? lastFirst.trim() : [...parts.slice(1), parts[0]].join(" ");
}

export function mapMembers(raw: RawMember[]): KiloMayoMember[] {
  return raw.map((m) => ({
    id: m.id,
    name: displayName(m.info?.fallbackNameWithLastNameFirst ?? "?"),
    email: m.contactDetail?.email ?? null,
    phone: m.contactDetail?.phone ?? null,
    contracts: m.workContracts.map((c) => ({
      id: c.id,
      validSince: c.validSince?.slice(0, 10) ?? null,
      validUntil: c.validUntil?.slice(0, 10) ?? null,
      presetName: c.preset?.name ?? null,
      hourlyWage: num(c.hourlyWage),
      monthlyWage: num(c.monthlyWage),
    })),
    documentUrl: m.documents[0]?.url ?? null,
  }));
}

interface RawMonthState {
  memberId: string;
  yearMonth: string;
  statisticalDurationMinutes: number;
}

/** statisticalDurationMinutes = odpracované minuty, které KiloMayo bere do statistik. */
export function mapMonthStates(raw: RawMonthState[]): KiloMayoMonthHours[] {
  return raw.map((r) => ({
    memberId: r.memberId,
    month: r.yearMonth,
    hours: Math.round((r.statisticalDurationMinutes / 60) * 100) / 100,
    shifts: 0, // endpoint počet směn nevrací
  }));
}

export class KiloMayoHttp implements KiloMayoSource {
  private token: string | null = null;

  constructor(
    private baseUrl: string,
    private email: string,
    private password: string,
  ) {}

  /** Přihlášení heslem přes Contember tenant API (neověřeno mimo prohlížeč). */
  async login(): Promise<void> {
    const res = (await this.post("/api/v1/graphql/auth", {
      query: QUERIES.signIn,
      variables: { email: this.email, password: this.password },
    })) as { data?: { signIn?: { ok: boolean; error?: { code: string }; result?: { token: string } } } };
    const r = res.data?.signIn;
    if (!r?.ok || !r.result?.token) throw new Error(`KiloMayo přihlášení selhalo: ${r?.error?.code ?? "neznámá chyba"}`);
    this.token = r.result.token;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`KiloMayo ${path}: HTTP ${res.status}`);
    return res.json();
  }

  async members(): Promise<KiloMayoMember[]> {
    const res = (await this.post("/api/v1/contember/content", { query: QUERIES.members })) as {
      data?: { listMember: RawMember[] };
      errors?: { message: string }[];
    };
    if (res.errors?.length || !res.data) throw new Error(`KiloMayo členové: ${res.errors?.[0]?.message ?? "bez dat"}`);
    return mapMembers(res.data.listMember);
  }

  async monthlyHours(fromMonth: string, toMonth: string, memberIds: string[]): Promise<KiloMayoMonthHours[]> {
    const res = (await this.post("/api/v1/stats/member-monthly-shifts-states", {
      fromMonth,
      toMonth,
      workerIds: memberIds,
    })) as { memberMonthlyShiftsStates?: RawMonthState[] };
    if (!res.memberMonthlyShiftsStates) throw new Error("KiloMayo statistiky: neočekávaná odpověď");
    return mapMonthStates(res.memberMonthlyShiftsStates);
  }
}
