import Link from "next/link";
import type { Flag } from "@/lib/checks";
import type { MonthRow } from "@/lib/checks";
import type { Person, Task } from "@/lib/db/schema";
import { createTask, setTaskStatus } from "@/app/actions";
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

export function TaskList({ tasks, people }: { tasks: Task[]; people: Person[] }) {
  const name = new Map(people.map((p) => [p.id, p.fullName]));
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
              <div style={t.status === "done" ? { textDecoration: "line-through" } : undefined}>{t.title}</div>
              <div className="detail">
                {[t.personId ? name.get(t.personId) : null, t.dueDate ? `do ${formatDate(t.dueDate)}` : null, t.detail]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
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
