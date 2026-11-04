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
