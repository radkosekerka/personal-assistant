"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireUser } from "@/lib/session";

async function audit(actor: string, action: string, detail?: string) {
  await getDb().insert(schema.auditLog).values({ actor, action, detail });
}

const taskInput = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(2000).optional(),
  personId: z.coerce.number().int().positive().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  flagKey: z.string().max(200).optional(),
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
  });
  await getDb().insert(schema.tasks).values(data).onConflictDoNothing();
  await audit(actor, "task.create", data.title);
  revalidatePath("/", "layout");
}

export async function setTaskStatus(form: FormData) {
  const actor = await requireUser();
  const id = z.coerce.number().int().positive().parse(form.get("id"));
  const status = z.enum(["open", "done"]).parse(form.get("status"));
  await getDb().update(schema.tasks).set({ status }).where(eq(schema.tasks.id, id));
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
