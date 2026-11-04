/**
 * Jeden běh centrálního bota (ráno přes cron, nebo tlačítkem v dashboardu):
 * 1. posbírá red flags ze všech modulů,
 * 2. založí úkoly a přidělí je lidem, vyřešené uzavře,
 * 3. u odpovědí zákazníkům připraví návrh textu,
 * 4. sestaví plán dne a zprávy pro jednotlivé lidi ke schválení.
 * Nic neodesílá: zprávy čekají v „outbox“ na schválení.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { todayIso } from "../dates";
import { collectFlags } from "./collect";
import { buildDay, ownerMessage, planTasks, ruleBrief, MODULE_LABEL, type DayPlan, type ModuleKey } from "./plan";
import { BRIEF_PROMPT, REPLY_PROMPT, gemini } from "./llm";

const REPLY_CODES = ["INQUIRY_UNANSWERED", "REVIEW_NEGATIVE", "REVIEW_UNANSWERED", "MESSAGE_UNANSWERED"];

export interface BotResult {
  created: number;
  closed: number;
  drafts: number;
  messages: number;
  briefBy: "gemini" | "pravidla";
}

function factsFor(day: DayPlan): string {
  const lines = day.top.map(
    (t) => `- [${MODULE_LABEL[t.module as ModuleKey] ?? t.module}] ${t.priority === 1 ? "KRITICKÉ " : ""}${t.title}${t.dueDate ? `, termín ${t.dueDate}` : ""}`,
  );
  const who = day.byOwner.map((o) => `- ${o.owner?.name ?? "nepřiděleno"}: ${o.tasks.length} úkolů, ${o.overdue} po termínu`);
  return [`Dnes je ${day.today}. Otevřených úkolů ${day.openCount}.`, "Nejdůležitější:", ...lines, "Lidé:", ...who].join("\n");
}

export async function runBot(actor: string, opts: { ai?: boolean } = {}): Promise<BotResult> {
  const ai = opts.ai ?? true;
  const db = getDb();
  const today = todayIso();
  const [flags, tasks, owners] = await Promise.all([
    collectFlags(),
    db.select().from(schema.tasks),
    db.select().from(schema.owners),
  ]);

  // 1–2: úkoly z red flagů
  const plan = planTasks(flags, tasks, owners, today);
  let drafts = 0;
  for (const t of plan.create) {
    let draft: string | null = null;
    if (ai && REPLY_CODES.some((c) => t.flagKey.startsWith(c))) {
      draft = await gemini(REPLY_PROMPT(`Situace: ${t.title}\n${t.detail ?? ""}`), 300);
      if (draft) drafts++;
    }
    await db.insert(schema.tasks).values({ ...t, draft }).onConflictDoNothing();
  }
  if (plan.close.length) {
    await db
      .update(schema.tasks)
      .set({ status: "done", closedAt: sql`now()`, closedBy: "bot" })
      .where(inArray(schema.tasks.id, plan.close));
  }

  // 4: plán dne
  const open = await db.select().from(schema.tasks).where(eq(schema.tasks.status, "open"));
  const closedToday = (
    await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.closedBy, "bot"), gte(schema.tasks.closedAt, sql`date_trunc('day', now())`)))
  ).length;
  const day = buildDay(open, owners, today, { closedToday, createdToday: plan.create.length });
  const aiText = ai ? await gemini(BRIEF_PROMPT(factsFor(day))) : null;
  const text = aiText ?? ruleBrief(day);
  const briefBy = aiText ? "gemini" : "pravidla";
  await db
    .insert(schema.briefs)
    .values({ date: today, text, generatedBy: briefBy })
    .onConflictDoUpdate({ target: schema.briefs.date, set: { text, generatedBy: briefBy, createdAt: sql`now()` } });

  // Zprávy lidem: jen návrhy ke schválení. Schválenou nebo zamítnutou už nepřepisujeme.
  const url = process.env.DASHBOARD_URL ?? "https://dashboard.wakesurfnaklo.cz";
  let messages = 0;
  for (const o of day.byOwner) {
    if (!o.owner || (!o.owner.whatsapp && !o.owner.email)) continue;
    const body = ownerMessage(o, today, url);
    const channel = o.owner.whatsapp ? "whatsapp" : "email";
    await db
      .insert(schema.outbox)
      .values({ date: today, ownerId: o.owner.id, channel, text: body })
      .onConflictDoUpdate({
        target: [schema.outbox.ownerId, schema.outbox.date],
        set: { text: body, channel },
        setWhere: eq(schema.outbox.status, "ke_schvaleni"),
      });
    messages++;
  }

  const result: BotResult = { created: plan.create.length, closed: plan.close.length, drafts, messages, briefBy };
  await db.insert(schema.auditLog).values({ actor, action: "bot.run", detail: JSON.stringify(result) });
  return result;
}
