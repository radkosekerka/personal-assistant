import Link from "next/link";
import { dashboardData } from "@/lib/data";
import { eventsData } from "@/lib/events/data";
import { MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [hr, ev] = await Promise.all([dashboardData(), eventsData()]);
  const hrCrit = hr.flags.filter((f) => f.severity === "critical");
  const evCrit = ev.flags.filter((f) => f.severity === "critical");
  const openTasks = hr.tasks.filter((t) => t.status === "open").length;

  const stats: Record<string, [string, number | string, boolean?][]> = {
    hr: [
      ["kritických", hrCrit.length, hrCrit.length > 0],
      ["varování", hr.flags.length - hrCrit.length],
      ["aktivních lidí", hr.snapshot.people.filter((p) => p.active).length],
      ["úkolů", openTasks],
    ],
    events: [
      ["bez odpovědi", ev.inquiries.filter((q) => !q.answered).length, evCrit.length > 0],
      ["rozjednaných", ev.events.filter((e) => e.status === "jedna_se" || e.status === "nova").length],
      ["potvrzených", ev.events.filter((e) => e.status === "potvrzeno" && (e.startDate ?? "") >= ev.today).length],
    ],
  };

  const allCritical = [
    ...hrCrit.map((f) => ({ key: f.key, title: f.title, href: f.personId ? `/hr/lide/${f.personId}` : "/hr", module: "HR" })),
    ...evCrit.map((f) => ({ key: f.key, title: f.title, href: f.href, module: "Events" })),
  ];

  return (
    <>
      <h1>Náklo Dashboard</h1>
      <div className="modules">
        {MODULES.map((m) => (
          <Link key={m.key} href={m.href} className={`module ${m.live ? "" : "soon"}`}>
            <h2>{m.name}</h2>
            <div className="muted" style={{ fontSize: 13 }}>{m.summary}</div>
            {m.live ? (
              <div className="stats">
                {(stats[m.key] ?? []).map(([label, n, bad]) => (
                  <span key={label}>
                    <b style={bad ? { color: "var(--critical)" } : undefined}>{n}</b> {label}
                  </span>
                ))}
              </div>
            ) : (
              <span className="badge neutral" style={{ alignSelf: "flex-start" }}>připravuje se</span>
            )}
          </Link>
        ))}
      </div>

      <h2>Kritické napříč moduly ({allCritical.length})</h2>
      {allCritical.length === 0 ? (
        <div className="card empty">Nic kritického.</div>
      ) : (
        <div className="card">
          <ul className="flags">
            {allCritical.map((f) => (
              <li key={f.key}>
                <span className="badge neutral">{f.module}</span>
                <div className="body">
                  <Link href={f.href}>{f.title}</Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
