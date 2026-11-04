/**
 * Mozek centrálního bota: čistá logika bez databáze, aby šla testovat
 * a později použít i z WhatsApp rozhraní.
 */
import type { Owner, Task } from "../db/schema";
import { addDays, formatDate } from "../dates";

export type ModuleKey = "hr" | "events" | "finance" | "kemp" | "wakesurf" | "bistro" | "wakeboard" | "obecne";

export const MODULE_LABEL: Record<ModuleKey, string> = {
  hr: "HR",
  events: "Events & PR",
  finance: "Finance",
  kemp: "Kemp",
  wakesurf: "Wakesurf",
  bistro: "Bistro",
  wakeboard: "Wakeboard",
  obecne: "Obecné",
};

/** Red flag z libovolného modulu ve společném tvaru. */
export interface BotFlag {
  key: string;
  module: ModuleKey;
  severity: "critical" | "warning";
  title: string;
  detail?: string;
  href: string;
}

export interface NewTask {
  title: string;
  detail: string | null;
  module: ModuleKey;
  ownerId: number | null;
  priority: number;
  dueDate: string;
  flagKey: string;
  href: string;
  source: "flag";
}

export interface TaskPlan {
  create: NewTask[];
  /** Otevřené úkoly z red flagů, jejichž problém už zmizel: bot je uzavře. */
  close: number[];
}

/** Kdo odpovídá za modul: první aktivní vlastník s tímto modulem, jinak ten s "*". */
export function ownerFor(module: string, owners: Owner[]): Owner | undefined {
  const active = owners.filter((o) => o.active);
  return active.find((o) => o.modules.includes(module)) ?? active.find((o) => o.modules.includes("*"));
}

export function planTasks(flags: BotFlag[], tasks: Task[], owners: Owner[], today: string): TaskPlan {
  const byKey = new Map(tasks.filter((t) => t.flagKey).map((t) => [t.flagKey!, t]));
  const live = new Set(flags.map((f) => f.key));
  const create: NewTask[] = [];
  for (const f of flags) {
    if (byKey.has(f.key)) continue;
    create.push({
      title: f.title,
      detail: f.detail ?? null,
      module: f.module,
      ownerId: ownerFor(f.module, owners)?.id ?? null,
      priority: f.severity === "critical" ? 1 : 2,
      dueDate: f.severity === "critical" ? today : addDays(today, 2),
      flagKey: f.key,
      href: f.href,
      source: "flag",
    });
  }
  const close = tasks
    .filter((t) => t.status === "open" && t.source === "flag" && t.flagKey && !live.has(t.flagKey))
    .map((t) => t.id);
  return { create, close };
}

export interface OwnerDay {
  owner: Owner | null;
  tasks: Task[];
  overdue: number;
  critical: number;
}

export interface DayPlan {
  today: string;
  byOwner: OwnerDay[];
  /** Nejdůležitější věci dne napříč firmou (max 7). */
  top: Task[];
  openCount: number;
  closedToday: number;
  createdToday: number;
}

/** Pořadí: priorita, po termínu, termín, nejstarší. */
export function sortTasks(tasks: Task[], today: string): Task[] {
  const due = (t: Task) => t.dueDate ?? "9999-12-31";
  return [...tasks].sort(
    (a, b) =>
      a.priority - b.priority ||
      Number(due(b) < today) - Number(due(a) < today) ||
      due(a).localeCompare(due(b)) ||
      a.id - b.id,
  );
}

export function buildDay(
  openTasks: Task[],
  owners: Owner[],
  today: string,
  stats: { closedToday: number; createdToday: number },
): DayPlan {
  const open = sortTasks(
    openTasks.filter((t) => t.status === "open"),
    today,
  );
  const groups = new Map<number | null, Task[]>();
  for (const t of open) groups.set(t.ownerId, [...(groups.get(t.ownerId) ?? []), t]);
  const byOwner: OwnerDay[] = [...groups.entries()]
    .map(([id, ts]) => ({
      owner: owners.find((o) => o.id === id) ?? null,
      tasks: ts,
      overdue: ts.filter((t) => t.dueDate && t.dueDate < today).length,
      critical: ts.filter((t) => t.priority === 1).length,
    }))
    .sort((a, b) => b.critical - a.critical || b.tasks.length - a.tasks.length);
  return { today, byOwner, top: open.slice(0, 7), openCount: open.length, ...stats };
}

const dueLabel = (t: Task, today: string) =>
  !t.dueDate ? "" : t.dueDate < today ? ` (po termínu ${formatDate(t.dueDate)})` : t.dueDate === today ? " (dnes)" : ` (do ${formatDate(t.dueDate)})`;

/** Zpráva pro jednoho člověka (WhatsApp/e-mail). Max 8 úkolů, ať se to dá přečíst na mobilu. */
export function ownerMessage(day: OwnerDay, today: string, dashboardUrl: string): string {
  const first = day.owner?.name.split(" ")[0] ?? "";
  const lines = day.tasks.slice(0, 8).map((t, i) => `${i + 1}. ${t.priority === 1 ? "❗ " : ""}${t.title}${dueLabel(t, today)}`);
  const more = day.tasks.length > 8 ? `\n…a dalších ${day.tasks.length - 8}.` : "";
  return `Ahoj ${first}, úkoly na dnes (${formatDate(today)}):\n${lines.join("\n")}${more}\n\nVše v dashboardu: ${dashboardUrl}/ukoly`;
}

/** Plán dne bez AI: použije se, když není klíč nebo AI neodpoví. */
export function ruleBrief(day: DayPlan): string {
  if (day.openCount === 0) return "Dnes není nic otevřeného. 👍";
  const crit = day.top.filter((t) => t.priority === 1);
  const head = [
    `Otevřených úkolů: ${day.openCount}${crit.length ? `, z toho kritických ${day.byOwner.reduce((s, o) => s + o.critical, 0)}` : ""}.`,
    day.createdToday || day.closedToday
      ? `Od včera bot založil ${day.createdToday} a uzavřel ${day.closedToday} vyřešených.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const top = day.top.map((t, i) => `${i + 1}. [${MODULE_LABEL[t.module as ModuleKey] ?? t.module}] ${t.title}${dueLabel(t, day.today)}`);
  const who = day.byOwner
    .filter((o) => o.owner)
    .map((o) => `${o.owner!.name}: ${o.tasks.length}${o.overdue ? ` (${o.overdue} po termínu)` : ""}`)
    .join(", ");
  return [head, "", "Co dnes udělat jako první:", ...top, "", who ? `Rozdělení: ${who}.` : ""].join("\n").trim();
}
