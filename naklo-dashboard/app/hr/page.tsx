import Link from "next/link";
import { dashboardData } from "@/lib/data";
import { monthRows } from "@/lib/checks";
import { addMonths, formatCzk, monthLabel, monthOf } from "@/lib/dates";
import { FlagList, PerformanceBadge, TaskList } from "@/components/ui";
import type { Person } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function PeopleCard({ people, empty }: { people: Person[]; empty: string }) {
  if (people.length === 0) return <div className="card empty">{empty}</div>;
  return (
    <div className="card">
      <ul className="flags">
        {people.map((p) => (
          <li key={p.id}>
            <PerformanceBadge v={p.performance} />
            <div className="body">
              <Link href={`/hr/lide/${p.id}`}>{p.fullName}</Link>
              <div className="detail">{[p.position, p.performanceNote].filter(Boolean).join(" · ")}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function HrOverview() {
  const { snapshot, tasks, flags, today } = await dashboardData();
  const active = snapshot.people.filter((p) => p.active);
  const payFlags = flags.filter((f) => !["STAFFING_GAP", "TRAINING_MISSING", "TRAINING_EXPIRING"].includes(f.code));
  const staffing = flags.filter((f) => f.code === "STAFFING_GAP");
  const training = flags.filter((f) => f.code === "TRAINING_MISSING" || f.code === "TRAINING_EXPIRING");
  const critical = flags.filter((f) => f.severity === "critical").length;
  const warning = flags.length - critical;
  const openTasks = tasks.filter((t) => t.status === "open");

  const lastMonth = addMonths(monthOf(today), -1);
  const rows = monthRows(snapshot, lastMonth).filter((r) => r.status !== "no-work");
  const paidCount = rows.filter((r) => r.status === "ok").length;
  const paidTotal = rows.reduce((s, r) => s + r.paid, 0);
  const hoursTotal = rows.reduce((s, r) => s + r.hours, 0);

  return (
    <>
      <h1>HR</h1>
      <div className="tiles">
        <Link className="tile critical" href="/hr/red-flags">
          <div className="n">{critical}</div>
          <div className="l">kritických red flags</div>
        </Link>
        <Link className="tile warning" href="/hr/red-flags">
          <div className="n">{warning}</div>
          <div className="l">varování</div>
        </Link>
        <Link className="tile" href="/hr/ukoly">
          <div className="n">{openTasks.length}</div>
          <div className="l">otevřených úkolů</div>
        </Link>
        <Link className="tile" href="/hr/lide">
          <div className="n">{active.length}</div>
          <div className="l">aktivních lidí</div>
        </Link>
        <Link className="tile" href={`/hr/mesic/${lastMonth}`}>
          <div className="n">
            {paidCount}/{rows.length}
          </div>
          <div className="l">
            zaplaceno za {monthLabel(lastMonth)} · {formatCzk(paidTotal)} · {hoursTotal} h
          </div>
        </Link>
      </div>

      <div className="grid2">
        <section>
          <h2>Smlouvy a výplaty</h2>
          <FlagList flags={payFlags} tasks={tasks} limit={8} />
        </section>
        <section>
          <h2>Úkoly</h2>
          <TaskList tasks={openTasks.slice(0, 10)} people={snapshot.people} />
        </section>
      </div>

      <h2>Tým</h2>
      <div className="grid2">
        <section>
          <h3>Kdo nám chybí</h3>
          <FlagList flags={staffing} tasks={tasks} />
        </section>
        <section>
          <h3>Koho vyškolit</h3>
          <FlagList flags={training} tasks={tasks} />
        </section>
        <section>
          <h3>Top performeři</h3>
          <PeopleCard people={active.filter((p) => p.performance === "top")} empty="Zatím nikdo nemá hodnocení." />
        </section>
        <section>
          <h3>Sledovat a na odchod</h3>
          <PeopleCard
            people={active
              .filter((p) => p.performance === "watch" || p.performance === "exit")
              .sort((a, b) => (a.performance === "exit" ? -1 : 1) - (b.performance === "exit" ? -1 : 1))}
            empty="Nikdo."
          />
        </section>
      </div>
    </>
  );
}
