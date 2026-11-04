import Link from "next/link";
import type { Flag } from "@/lib/checks";
import type { MonthRow } from "@/lib/checks";
import type { Owner, Person, Task } from "@/lib/db/schema";
import { assignTask, createTask, setTaskStatus } from "@/app/actions";
import { MODULE_LABEL, type ModuleKey } from "@/lib/bot/plan";
import { formatDate } from "@/lib/dates";

export const RELATION_LABEL: Record<string, string> = {
  HPP: "HPP",
  DPP: "DPP",
  DPC: "DPČ",
  ICO: "IČO",
};

export function SeverityBadge({ s }: { s: Flag["severity"] }) {
  return <span className={`badge ${s}`}>{s === "critical" ? "Kritické" : "Varování"}</span>;
}

export function FlagList({ flags, tasks, limit }: { flags: Flag[]; tasks: Task[]; limit?: number }) {
  const withTask = new Set(tasks.map((t) => t.flagKey).filter(Boolean));
  const shown = limit ? flags.slice(0, limit) : flags;
  if (flags.length === 0) return <div className="card empty">Žádné red flags. Všechno sedí.</div>;
  return (
    <div className="card">
      <ul className="flags">
        {shown.map((f) => (
          <li key={f.key}>
            <SeverityBadge s={f.severity} />
            <div className="body">
              {f.personId ? <Link href={`/hr/lide/${f.personId}`}>{f.title}</Link> : f.title}
              {f.detail && <div className="detail">{f.detail}</div>}
            </div>
            {withTask.has(f.key) ? (
              <span className="badge neutral">Úkol založen</span>
            ) : (
              <form action={createTask} className="inline">
                <input type="hidden" name="title" value={f.title} />
                {f.detail && <input type="hidden" name="detail" value={f.detail} />}
                {f.personId && <input type="hidden" name="personId" value={f.personId} />}
                <input type="hidden" name="flagKey" value={f.key} />
                <button type="submit">Udělat úkol</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {limit && flags.length > limit && (
        <div className="empty">
          <Link href="/hr/red-flags">Všech {flags.length} red flags →</Link>
        </div>
      )}
    </div>
  );
}

export function TaskList({
  tasks,
  people = [],
  owners = [],
  showModule = false,
}: {
  tasks: Task[];
  people?: Person[];
  owners?: Owner[];
  showModule?: boolean;
}) {
  const name = new Map(people.map((p) => [p.id, p.fullName]));
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  if (tasks.length === 0) return <div className="card empty">Žádné úkoly.</div>;
  return (
    <div className="card">
      <ul className="flags">
        {tasks.map((t) => (
          <li key={t.id} style={t.status === "done" ? { opacity: 0.55 } : undefined}>
            <form action={setTaskStatus} className="inline">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={t.status === "open" ? "done" : "open"} />
              <button type="submit" aria-label={t.status === "open" ? "Označit jako hotové" : "Vrátit"}>
                {t.status === "open" ? "☐" : "☑"}
              </button>
            </form>
            <div className="body">
              <div style={t.status === "done" ? { textDecoration: "line-through" } : undefined}>
                {t.priority === 1 && t.status === "open" && <span className="badge critical">Kritické</span>}{" "}
                {showModule && <span className="badge neutral">{MODULE_LABEL[t.module as ModuleKey] ?? t.module}</span>}{" "}
                {t.href ? <Link href={t.href}>{t.title}</Link> : t.title}
              </div>
              <div className="detail">
                {[
                  t.ownerId ? ownerName.get(t.ownerId) : null,
                  t.personId ? name.get(t.personId) : null,
                  t.dueDate ? `do ${formatDate(t.dueDate)}` : null,
                  t.closedBy === "bot" ? "uzavřel bot (problém zmizel)" : null,
                  t.detail,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {t.draft && t.status === "open" && (
                <details className="draft">
                  <summary>Návrh odpovědi od bota</summary>
                  <pre>{t.draft}</pre>
                </details>
              )}
            </div>
            {owners.length > 0 && t.status === "open" && (
              <form action={assignTask} className="inline assign">
                <input type="hidden" name="id" value={t.id} />
                <select name="ownerId" defaultValue={t.ownerId ?? ""} aria-label="Přidělit">
                  <option value="">Nikdo</option>
                  {owners
                    .filter((o) => o.active)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
                <button type="submit">Přidělit</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS: Record<MonthRow["status"], [string, string]> = {
  ok: ["ok", "Zaplaceno"],
  unpaid: ["critical", "Nezaplaceno"],
  partial: ["warning", "Částečně"],
  "no-contract": ["critical", "Bez smlouvy"],
  "no-work": ["neutral", "Bez práce"],
};

export function MonthStatus({ s }: { s: MonthRow["status"] }) {
  const [cls, label] = STATUS[s];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export const PERFORMANCE: Record<string, [string, string]> = {
  top: ["ok", "Top performer"],
  ok: ["neutral", "V pořádku"],
  watch: ["warning", "Sledovat"],
  exit: ["critical", "Na odchod"],
};

export function PerformanceBadge({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="muted">–</span>;
  const [cls, label] = PERFORMANCE[v];
  return <span className={`badge ${cls}`}>{label}</span>;
}
