/**
 * Převod členů a smluv z KiloMayo do evidence. Čistá logika, zápis dělá applyMembers.
 *
 * Předpoklad k potvrzení: smlouva zadaná v KiloMayo = podepsaná smlouva.
 * Proto se importuje jako "signed"; odkaz na dokument se vyplní, když ho člen v KiloMayo má.
 */
import { sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Contract, Person } from "../db/schema";
import type { KiloMayoMember } from "./client";

type RelationType = "HPP" | "DPP" | "DPC" | "ICO";

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Název šablony smlouvy v KiloMayo → typ vztahu. Stáž a neznámé vrací null. */
export function presetToType(name: string | null): RelationType | null {
  const n = norm(name ?? "").replace(/\./g, "");
  if (n === "hpp") return "HPP";
  if (n === "dpp") return "DPP";
  if (n === "dpc") return "DPC";
  if (n === "ic" || n === "ico") return "ICO";
  return null;
}

export interface MembersPlan {
  /** Noví lidé, kteří v evidenci ještě nejsou. */
  create: { member: KiloMayoMember; relationType: RelationType | null }[];
  /** Existující lidé: doplnit vazbu na KiloMayo a typ vztahu podle aktuální smlouvy. */
  link: { personId: number; memberId: string; relationType: RelationType | null }[];
  /** Smlouvy k vložení nebo aktualizaci (podle KiloMayo ID). personId chybí u nově zakládaných. */
  contracts: {
    memberId: string;
    kilomayoContractId: string;
    type: RelationType;
    validFrom: string;
    validTo: string | null;
    hourlyRate: number | null;
    monthlyFee: number | null;
    driveUrl: string | null;
  }[];
  /** Smlouvy, které nejde převést (Stáž, chybí začátek). */
  skipped: { memberId: string; name: string; reason: string }[];
}

/** Aktuální typ vztahu: smlouva platná k danému dni, jinak poslední podle začátku. */
export function currentType(m: KiloMayoMember, today: string): RelationType | null {
  const valid = m.contracts
    .filter((c) => (!c.validSince || c.validSince <= today) && (!c.validUntil || c.validUntil >= today))
    .sort((a, b) => (b.validSince ?? "").localeCompare(a.validSince ?? ""));
  const last = [...m.contracts].sort((a, b) => (b.validSince ?? "").localeCompare(a.validSince ?? ""));
  return presetToType((valid[0] ?? last[0])?.presetName ?? null);
}

export function planMembers(people: Person[], members: KiloMayoMember[], today: string): MembersPlan {
  const byMember = new Map(people.filter((p) => p.kilomayoMemberId).map((p) => [p.kilomayoMemberId!, p]));
  const byName = new Map<string, Person[]>();
  for (const p of people) byName.set(norm(p.fullName), [...(byName.get(norm(p.fullName)) ?? []), p]);

  const plan: MembersPlan = { create: [], link: [], contracts: [], skipped: [] };
  for (const m of members) {
    const type = currentType(m, today);
    let p = byMember.get(m.id);
    if (!p) {
      const hits = (byName.get(norm(m.name)) ?? []).filter((x) => !x.kilomayoMemberId);
      if (hits.length === 1) p = hits[0];
    }
    if (p) plan.link.push({ personId: p.id, memberId: m.id, relationType: type });
    else plan.create.push({ member: m, relationType: type });

    for (const c of m.contracts) {
      const t = presetToType(c.presetName);
      if (!t) {
        plan.skipped.push({ memberId: m.id, name: m.name, reason: `typ „${c.presetName ?? "?"}“` });
        continue;
      }
      if (!c.validSince) {
        plan.skipped.push({ memberId: m.id, name: m.name, reason: "smlouva bez data začátku" });
        continue;
      }
      plan.contracts.push({
        memberId: m.id,
        kilomayoContractId: c.id,
        type: t,
        validFrom: c.validSince,
        validTo: c.validUntil,
        hourlyRate: c.hourlyWage != null ? Math.round(c.hourlyWage) : null,
        monthlyFee: c.monthlyWage != null ? Math.round(c.monthlyWage) : null,
        driveUrl: m.documentUrl,
      });
    }
  }
  return plan;
}

export async function applyMembers(plan: MembersPlan, actor: string) {
  const db = getDb();
  const idByMember = new Map<string, number>();
  for (const l of plan.link) {
    await db
      .update(schema.people)
      .set({ kilomayoMemberId: l.memberId, ...(l.relationType ? { relationType: l.relationType } : {}) })
      .where(sql`${schema.people.id} = ${l.personId}`);
    idByMember.set(l.memberId, l.personId);
  }
  for (const c of plan.create) {
    const [row] = await db
      .insert(schema.people)
      .values({
        fullName: c.member.name,
        email: c.member.email,
        phone: c.member.phone,
        relationType: c.relationType,
        kilomayoMemberId: c.member.id,
      })
      .returning({ id: schema.people.id });
    idByMember.set(c.member.id, row.id);
  }
  for (const c of plan.contracts) {
    const personId = idByMember.get(c.memberId);
    if (!personId) continue;
    const values = {
      personId,
      type: c.type,
      status: "signed" as Contract["status"],
      validFrom: c.validFrom,
      validTo: c.validTo,
      hourlyRate: c.hourlyRate,
      monthlyFee: c.monthlyFee,
      driveUrl: c.driveUrl,
      kilomayoContractId: c.kilomayoContractId,
    };
    await db
      .insert(schema.contracts)
      .values(values)
      .onConflictDoUpdate({ target: schema.contracts.kilomayoContractId, set: values });
  }
  await db.insert(schema.auditLog).values({
    actor,
    action: "sync.members.kilomayo",
    detail: `${plan.create.length} nových, ${plan.link.length} spárovaných, ${plan.contracts.length} smluv, ${plan.skipped.length} přeskočeno`,
  });
}
