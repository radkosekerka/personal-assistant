/**
 * Převod listů z tabulky „Event Form 2026“ na záznamy. Čisté funkce, bez sítě.
 * Listy: „Pronájmy / Akce“ (pipeline), „Solidpixels“ a „New-web“ (poptávky z webu), „Leady“.
 */
import type { IsoDate } from "../dates";

export type EventStatus = "nova" | "jedna_se" | "potvrzeno" | "storno";

export interface ParsedEvent {
  sourceKey: string;
  type: string | null;
  contactName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  people: number | null;
  budget: number | null;
  spent: number | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  status: EventStatus;
  statusRaw: string | null;
  source: string | null;
  space: string | null;
  accommodation: string | null;
  boat: boolean;
  catering: string | null;
  note: string | null;
}

export interface ParsedInquiry {
  sourceKey: string;
  receivedAt: Date | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  channel: string;
  answered: boolean;
}

export interface ParsedLead {
  sourceKey: string;
  type: string | null;
  category: string | null;
  company: string;
  stage: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  priority: string | null;
  why: string | null;
  web: string | null;
}

const clean = (v: string | undefined | null) => {
  const s = (v ?? "").trim();
  return s === "" || s.toLowerCase() === "none" ? null : s;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Datum v podobách, které v tabulce jsou: "17.7.2025", "17. 7. 2025", "04/04/2026 18:40:00"
 * (den/měsíc), "2025-04-09 10:33:59". Bez roku vrací null (nejde spolehlivě určit).
 */
export function parseCzDate(v: string | null | undefined): IsoDate | null {
  const s = clean(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

export function parseDateTime(v: string | null | undefined): Date | null {
  const s = clean(v);
  if (!s) return null;
  const d = parseCzDate(s);
  if (!d) return null;
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const time = t ? `${pad(+t[1])}:${t[2]}:${t[3] ?? "00"}` : "00:00:00";
  // Časy z formulářů jsou v české zóně; pro přehled stačí přesnost na minuty.
  return new Date(`${d}T${time}+01:00`);
}

export function parseInt0(v: string | null | undefined): number | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** "Done, Potvrzeno - rezervace" → potvrzeno; "Done, Storno" → storno. */
export function mapStatus(raw: string | null): EventStatus {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("storno") || s.includes("zrušen")) return "storno";
  if (s.includes("potvrz") || s.includes("hotovo") || s.includes("rezervac")) return "potvrzeno";
  if (s.includes("nabíd") || s.includes("jedn") || s.includes("čeká") || s.includes("odeps")) return "jedna_se";
  return "nova";
}

/** Najde sloupce podle hlavičky (bez ohledu na velikost písmen a diakritiku). */
function indexer(header: string[]) {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const idx = new Map(header.map((h, i) => [norm(h), i]));
  return (row: string[], ...names: string[]) => {
    for (const n of names) {
      const i = idx.get(norm(n));
      if (i != null) return row[i];
    }
    return undefined;
  };
}

export function parsePronajmy(rows: string[][], sheet = "Pronajmy"): ParsedEvent[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const col = indexer(header);
  return body
    .map((r, i) => ({ r, line: i + 2 }))
    .filter(({ r }) => clean(col(r, "Kontakt")) || clean(col(r, "Email")) || clean(col(r, "Typ akce")))
    .map(({ r, line }) => {
      const statusRaw = clean(col(r, "Status"));
      return {
        sourceKey: `sheet:${sheet}:${line}`,
        type: clean(col(r, "Typ akce")),
        contactName: clean(col(r, "Kontakt")),
        company: clean(col(r, "Company", "Společnost")),
        email: clean(col(r, "Email"))?.toLowerCase() ?? null,
        phone: clean(col(r, "Tel", "Telefon")),
        people: parseInt0(col(r, "Počet lidí")),
        budget: parseInt0(col(r, "Budget")),
        spent: parseInt0(col(r, "Utraceno")),
        startDate: parseCzDate(col(r, "Datum Start")),
        endDate: parseCzDate(col(r, "Datum End")),
        status: mapStatus(statusRaw),
        statusRaw,
        source: clean(col(r, "Zdroj")),
        space: clean(col(r, "Rezervace")),
        accommodation: clean(col(r, "Ubytování")),
        boat: (clean(col(r, "Loď")) ?? "").toLowerCase().startsWith("ano"),
        catering: clean(col(r, "Cattering", "Catering")),
        note: clean(col(r, "Poznámka")),
      };
    });
}

/** Poptávky z webových formulářů. Řádky s „test“ v e-mailu nebo jménu se přeskočí. */
export function parseInquiries(rows: string[][], channel: string): ParsedInquiry[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const col = indexer(header);
  return body
    .map((r, i) => ({ r, line: i + 2 }))
    .map(({ r, line }) => {
      // Značka „Odepsáno“ je v nepojmenovaném sloupci za zprávou.
      const answeredCell = r.slice(5).join(" ").toLowerCase();
      return {
        sourceKey: `sheet:${channel}:${line}`,
        receivedAt: parseDateTime(col(r, "date", "Datum")),
        name: clean(col(r, "jmeno-a-prijmeni", "Jméno")),
        email: clean(col(r, "email"))?.toLowerCase() ?? null,
        phone: clean(col(r, "field-form-1-1-1-0", "Telefon")),
        message: clean(col(r, "vase-zprava", "Zpráva")),
        channel,
        answered: answeredCell.includes("odeps"),
      };
    })
    .filter((q) => q.email || q.message)
    .filter((q) => !/test/i.test(`${q.email} ${q.name}`));
}

export function parseLeads(rows: string[][]): ParsedLead[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const col = indexer(header);
  return body
    .map((r, i) => ({ r, line: i + 2 }))
    .filter(({ r }) => clean(col(r, "Společnost")))
    .map(({ r, line }) => ({
      sourceKey: `sheet:Leady:${line}`,
      type: clean(col(r, "Typ akce")),
      category: clean(col(r, "Kategorie")),
      company: clean(col(r, "Společnost"))!,
      stage: clean(col(r, "Stav jednání")),
      contactName: clean(col(r, "Kontaktní osoba")),
      email: clean(col(r, "Kontaktní email")),
      phone: clean(col(r, "Kontaktní telefon")),
      location: clean(col(r, "Lokalita")),
      priority: clean(col(r, "Priorita")),
      why: clean(col(r, "Proč se hodí pro Náklo")),
      web: clean(col(r, "Web")),
    }));
}

/**
 * Poptávka je vyřízená, když je označená „odepsáno“ nebo když stejný e-mail
 * už figuruje v pipeline akcí.
 */
export function markAnswered(inq: ParsedInquiry[], events: { email: string | null }[]): ParsedInquiry[] {
  const known = new Set(events.map((e) => e.email).filter(Boolean));
  return inq.map((q) => ({ ...q, answered: q.answered || (q.email != null && known.has(q.email)) }));
}
