import Link from "next/link";
import { eventsData } from "@/lib/events/data";
import { formatCzk, formatDate, monthLabel, monthOf } from "@/lib/dates";
import type { EventRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const STATUS: Record<EventRow["status"], [string, string]> = {
  nova: ["neutral", "Nová"],
  jedna_se: ["warning", "Rozjednaná"],
  potvrzeno: ["ok", "Potvrzená"],
  storno: ["critical", "Storno"],
};

function EventTable({ rows }: { rows: EventRow[] }) {
  if (rows.length === 0) return <div className="card empty">Nic.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Termín</th>
            <th>Akce</th>
            <th>Kontakt</th>
            <th className="num">Lidí</th>
            <th className="num">Budget</th>
            <th>Prostor / extra</th>
            <th>Stav</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td style={{ whiteSpace: "nowrap" }}>
                {formatDate(e.startDate)}
                {e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ""}
              </td>
              <td>
                {e.type ?? "–"}
                {e.company && <div className="muted">{e.company}</div>}
              </td>
              <td>
                {e.contactName ?? "–"}
                <div className="muted">{[e.email, e.phone].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="num">{e.people ?? "–"}</td>
              <td className="num">{e.budget ? formatCzk(e.budget) : "–"}</td>
              <td className="muted">
                {[e.space, e.accommodation, e.boat ? "loď" : null, e.catering ? "catering" : null].filter(Boolean).join(", ") ||
                  "–"}
              </td>
              <td>
                <span className={`badge ${STATUS[e.status][0]}`}>{STATUS[e.status][1]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function EventsPage() {
  const { events, inquiries, leads, flags, today } = await eventsData();
  const year = Number(today.slice(0, 4));
  const unanswered = inquiries.filter((q) => !q.answered);
  const upcoming = events.filter((e) => e.status === "potvrzeno" && e.startDate && e.startDate >= today);
  const pipeline = events.filter((e) => e.status === "nova" || e.status === "jedna_se");
  const nextYear = events.filter((e) => e.startDate?.startsWith(String(year + 1)) && e.status !== "storno");
  const byMonth = new Map<string, EventRow[]>();
  for (const e of upcoming) {
    const m = monthOf(e.startDate!);
    byMonth.set(m, [...(byMonth.get(m) ?? []), e]);
  }
  const leadStages = new Map<string, number>();
  for (const l of leads) leadStages.set(l.stage ?? "bez stavu", (leadStages.get(l.stage ?? "bez stavu") ?? 0) + 1);
  const topLeads = leads.filter((l) => l.priority === "Vysoká" && (l.stage ?? "TODO") === "TODO").slice(0, 10);

  return (
    <>
      <h1>Events</h1>
      <div className="tiles">
        <a className={`tile ${unanswered.length ? "critical" : ""}`} href="#poptavky">
          <div className="n">{unanswered.length}</div>
          <div className="l">poptávek bez odpovědi</div>
        </a>
        <a className="tile warning" href="#pipeline">
          <div className="n">{pipeline.length}</div>
          <div className="l">nových a rozjednaných</div>
        </a>
        <a className="tile" href="#kalendar">
          <div className="n">{upcoming.length}</div>
          <div className="l">potvrzených akcí před námi</div>
        </a>
        <a className="tile" href="#rok">
          <div className="n">{nextYear.length}</div>
          <div className="l">akcí na {year + 1}</div>
        </a>
        <a className="tile" href="#leady">
          <div className="n">{leads.length}</div>
          <div className="l">leadů na partnerské akce</div>
        </a>
      </div>

      {flags.length > 0 && (
        <>
          <h2>Red flags</h2>
          <div className="card">
            <ul className="flags">
              {flags.map((f) => (
                <li key={f.key}>
                  <span className={`badge ${f.severity}`}>{f.severity === "critical" ? "Kritické" : "Varování"}</span>
                  <div className="body">
                    <Link href={f.href}>{f.title}</Link>
                    {f.detail && <div className="detail">{f.detail}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <h2 id="poptavky">Poptávky bez odpovědi</h2>
      {unanswered.length === 0 ? (
        <div className="card empty">Všechny poptávky jsou vyřízené.</div>
      ) : (
        <div className="card">
          <ul className="flags">
            {unanswered.map((q) => (
              <li key={q.id}>
                <span className="badge neutral">{q.channel}</span>
                <div className="body">
                  <div>
                    {q.name ?? "–"} · {q.email ?? q.phone ?? ""}
                  </div>
                  <div className="detail">
                    {q.receivedAt ? formatDate(q.receivedAt.toISOString().slice(0, 10)) : ""} · {q.message}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 id="kalendar">Kalendář potvrzených akcí</h2>
      {byMonth.size === 0 ? (
        <div className="card empty">Žádné potvrzené akce před námi.</div>
      ) : (
        [...byMonth.entries()].map(([m, rows]) => (
          <section key={m}>
            <h3>{monthLabel(m)}</h3>
            <EventTable rows={rows} />
          </section>
        ))
      )}

      <h2 id="rok">Akce na {year + 1}</h2>
      <EventTable rows={nextYear} />

      <h2 id="pipeline">Nové a rozjednané</h2>
      <EventTable rows={pipeline} />

      <h2 id="leady">Leady na partnerské akce</h2>
      <p className="muted">
        {[...leadStages.entries()].map(([k, v]) => `${k}: ${v}`).join(" · ") || "Žádné leady."}
      </p>
      {topLeads.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Společnost</th>
                <th>Kategorie</th>
                <th>Lokalita</th>
                <th>Proč</th>
                <th>Kontakt</th>
              </tr>
            </thead>
            <tbody>
              {topLeads.map((l) => (
                <tr key={l.id}>
                  <td>{l.web ? <a href={l.web} target="_blank" rel="noreferrer">{l.company}</a> : l.company}</td>
                  <td>{l.category}</td>
                  <td>{l.location}</td>
                  <td className="muted">{l.why}</td>
                  <td className="muted">{[l.contactName, l.email].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
