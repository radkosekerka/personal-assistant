"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { runBot } from "@/lib/bot/run";
import { renewKbConsent, startKbConnection, syncAllBanks } from "@/lib/bank/sync";

async function audit(actor: string, action: string, detail?: string) {
  await getDb().insert(schema.auditLog).values({ actor, action, detail });
}

const taskInput = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(2000).optional(),
  personId: z.coerce.number().int().positive().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  flagKey: z.string().max(200).optional(),
  module: z.enum(["hr", "events", "finance", "kemp", "wakesurf", "bistro", "wakeboard", "obecne"]).optional(),
  ownerId: z.coerce.number().int().positive().optional(),
  priority: z.coerce.number().int().min(1).max(3).optional(),
});

function opt(v: FormDataEntryValue | null) {
  return v == null || v === "" ? undefined : String(v);
}

export async function createTask(form: FormData) {
  const actor = await requireUser();
  const data = taskInput.parse({
    title: opt(form.get("title")),
    detail: opt(form.get("detail")),
    personId: opt(form.get("personId")),
    dueDate: opt(form.get("dueDate")),
    flagKey: opt(form.get("flagKey")),
    module: opt(form.get("module")),
    ownerId: opt(form.get("ownerId")),
    priority: opt(form.get("priority")),
  });
  await getDb().insert(schema.tasks).values(data).onConflictDoNothing();
  await audit(actor, "task.create", data.title);
  revalidatePath("/", "layout");
}

export async function setTaskStatus(form: FormData) {
  const actor = await requireUser();
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  const status = z.enum(["open", "done"]).parse(form.get("status"));
  await getDb()
    .update(schema.tasks)
    .set(status === "done" ? { status, closedAt: new Date(), closedBy: actor } : { status, closedAt: null, closedBy: null })
    .where(eq(schema.tasks.id, id));
  await audit(actor, `task.${status}`, String(id));
  revalidatePath("/", "layout");
}

const UNIT = z.enum(["kemp", "wakesurf", "bistro", "wakeboard"]);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function addTransaction(form: FormData) {
  const actor = await requireUser();
  const data = z
    .object({
      unit: UNIT,
      date: DATE,
      kind: z.enum(["prijem", "naklad"]),
      category: z.string().trim().min(1).max(100),
      amount: z.coerce.number().int().positive().max(100_000_000),
      method: z.enum(["hotove", "karta", "prevod", "online"]),
      note: z.string().trim().max(500).optional(),
    })
    .parse({
      unit: form.get("unit"),
      date: form.get("date"),
      kind: form.get("kind"),
      category: form.get("category"),
      amount: form.get("amount"),
      method: form.get("method"),
      note: opt(form.get("note")),
    });
  await getDb().insert(schema.transactions).values({ ...data, source: "manual" });
  await audit(actor, `tx.${data.kind}`, `${data.unit} ${data.amount} ${data.category}`);
  revalidatePath("/", "layout");
}

export async function addCashCount(form: FormData) {
  const actor = await requireUser();
  const data = z
    .object({ unit: UNIT, date: DATE, amount: z.coerce.number().int().min(0).max(100_000_000), note: z.string().max(500).optional() })
    .parse({ unit: form.get("unit"), date: form.get("date"), amount: form.get("amount"), note: opt(form.get("note")) });
  await getDb().insert(schema.cashCounts).values({ ...data, countedBy: actor });
  await audit(actor, "cash.count", `${data.unit} ${data.amount}`);
  revalidatePath("/", "layout");
}

export async function setPrStatus(form: FormData) {
  const actor = await requireUser();
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  const status = z.enum(["nove", "vyrizeno", "planovano", "publikovano"]).parse(form.get("status"));
  await getDb().update(schema.prItems).set({ status }).where(eq(schema.prItems.id, id));
  await audit(actor, `pr.${status}`, String(id));
  revalidatePath("/", "layout");
}

export async function addPrItem(form: FormData) {
  const actor = await requireUser();
  const data = z
    .object({
      kind: z.enum(["zminka", "prispevek"]),
      channel: z.string().trim().min(1).max(60),
      at: DATE,
      title: z.string().trim().min(1).max(300),
      url: z.string().url().max(1000).optional(),
      eventId: z.coerce.number().int().positive().optional(),
      status: z.enum(["planovano", "publikovano", "vyrizeno"]),
    })
    .parse({
      kind: form.get("kind"),
      channel: form.get("channel"),
      at: form.get("at"),
      title: form.get("title"),
      url: opt(form.get("url")),
      eventId: opt(form.get("eventId")),
      status: form.get("status"),
    });
  await getDb().insert(schema.prItems).values({ ...data, at: new Date(`${data.at}T12:00:00Z`) });
  await audit(actor, `pr.add.${data.kind}`, data.title);
  revalidatePath("/", "layout");
}

export async function assignTask(form: FormData) {
  const actor = await requireUser();
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  const ownerId = z.coerce.number().int().positive().optional().parse(opt(form.get("ownerId")));
  await getDb().update(schema.tasks).set({ ownerId: ownerId ?? null }).where(eq(schema.tasks.id, id));
  await audit(actor, "task.assign", `${id} → ${ownerId ?? "nikdo"}`);
  revalidatePath("/", "layout");
}

export async function runBotNow() {
  const actor = await requireUser();
  await runBot(actor);
  revalidatePath("/", "layout");
}

/** Schválení nebo zamítnutí zprávy od bota. Samotné odeslání proběhne až po napojení kanálu. */
export async function decideOutbox(form: FormData) {
  const actor = await requireUser();
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  const status = z.enum(["schvaleno", "zamitnuto"]).parse(form.get("status"));
  const text = z.string().trim().min(1).max(4000).optional().parse(opt(form.get("text")));
  await getDb()
    .update(schema.outbox)
    .set({ status, decidedBy: actor, decidedAt: new Date(), ...(text ? { text } : {}) })
    .where(and(eq(schema.outbox.id, id), eq(schema.outbox.status, "ke_schvaleni")));
  await audit(actor, `outbox.${status}`, String(id));
  revalidatePath("/", "layout");
}

const MODULE_KEYS = ["*", "hr", "events", "finance", "kemp", "wakesurf", "bistro", "wakeboard", "obecne"] as const;

export async function saveOwner(form: FormData) {
  const actor = await requireUser();
  const data = z
    .object({
      id: z.coerce.number().int().positive().optional(),
      name: z.string().trim().min(1).max(100),
      role: z.string().trim().max(100).optional(),
      modules: z.array(z.enum(MODULE_KEYS)),
      whatsapp: z.string().trim().regex(/^\+?[0-9 ]{9,16}$/).optional(),
      email: z.string().trim().email().optional(),
      active: z.boolean(),
    })
    .parse({
      id: opt(form.get("id")),
      name: form.get("name"),
      role: opt(form.get("role")),
      modules: form.getAll("modules").map(String),
      whatsapp: opt(form.get("whatsapp")),
      email: opt(form.get("email")),
      active: form.get("active") !== "off",
    });
  const { id, ...values } = data;
  const row = { ...values, role: values.role ?? null, whatsapp: values.whatsapp?.replace(/\s/g, "") ?? null, email: values.email ?? null };
  if (id) await getDb().update(schema.owners).set(row).where(eq(schema.owners.id, id));
  else await getDb().insert(schema.owners).values(row);
  await audit(actor, id ? "owner.update" : "owner.create", data.name);
  revalidatePath("/", "layout");
}

/* ───────── Banka ───────── */

/** Založí propojení s KB a pošle prohlížeč do MojeBanka ke schválení (výběr účtů, KB klíč). */
export async function startBankConnection(form: FormData) {
  const actor = await requireUser();
  const data = z
    .object({ label: z.string().trim().min(1).max(100), companyId: z.coerce.number().int().positive().optional() })
    .parse({ label: form.get("label"), companyId: opt(form.get("companyId")) });
  const url = await startKbConnection(data.label, data.companyId ?? null, actor);
  redirect(url);
}

export async function renewBankConsent(form: FormData) {
  const actor = await requireUser();
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  redirect(await renewKbConsent(id, actor));
}

export async function syncBanksNow() {
  const actor = await requireUser();
  await syncAllBanks(actor);
  revalidatePath("/finance", "layout");
}

export async function saveBankAccount(form: FormData) {
  const actor = await requireUser();
  const data = z
    .object({
      id: z.coerce.number().int().positive(),
      lowBalanceLimit: z.coerce.number().int().min(0).optional(),
      companyId: z.coerce.number().int().positive().optional(),
      active: z.boolean(),
    })
    .parse({
      id: form.get("id"),
      lowBalanceLimit: opt(form.get("lowBalanceLimit")),
      companyId: opt(form.get("companyId")),
      active: form.get("active") === "on",
    });
  await getDb()
    .update(schema.bankAccounts)
    .set({ lowBalanceLimit: data.lowBalanceLimit ?? null, companyId: data.companyId ?? null, active: data.active })
    .where(eq(schema.bankAccounts.id, data.id));
  await audit(actor, "bank.account.update", String(data.id));
  revalidatePath("/finance", "layout");
}
