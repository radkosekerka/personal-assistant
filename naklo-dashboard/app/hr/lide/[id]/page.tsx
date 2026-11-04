import Link from "next/link";
import { notFound } from "next/navigation";
import { dashboardData } from "@/lib/data";
import { expectedAmount, signedContractFor } from "@/lib/checks";
import { formatCzk, formatDate, lastMonths, monthLabel, monthOf } from "@/lib/dates";
import { FlagList, PerformanceBadge, RELATION_LABEL, TaskList } from "@/components/ui";
import { createTask } from "@/app/actions";

export const dynamic = "force-dynamic";

const CONTRACT_STATUS: Record<string, [string, string]> = {
  signed: ["ok", "Podepsaná"],
  draft: ["warning", "Návrh"],
  terminated: ["neutral", "Ukončená"],
};

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { snapshot, flags, tasks, companies, today } = await dashboardData();
  const p = snapshot.people.find((x) => x.id === Number(id));
  if (!p) notFound();

  const contracts = snapshot.contracts
    .filter((c) => c.personId === p.id)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const months = lastMonths(monthOf(today), 12).reverse();
  const isIco = p.relationType === "ICO";

  return (
    <>
      <p className="muted">
        <Link href="/hr/lide">← Lidé</Link>
      </p>
      <h1>{p.fullName}</h1>
      <div className="grid2">
        <section>
          <dl className="facts">
            <dt>Typ</dt>
            <dd>{p.relationType ? RELATION_LABEL[p.relationType] : "nevyplněno"}</dd>
            <dt>Pozice</dt>
            <dd>{p.position ?? "–"}</dd>
            <dt>Firma</dt>
            <dd>{companies.find((c) => c.id === p.companyId)?.name ?? "–"}</dd>
            {p.ico && (
              <>
                <dt>IČO</dt>
                <dd>{p.ico}</dd>
              </>
            )}
            <dt>Sazba</dt>
            <dd>
              {p.monthlyFee ? `${formatCzk(p.monthlyFee)} měsíčně` : p.hourlyRate ? `${formatCzk(p.hourlyRate)}/h` : "–"}
            </dd>
            <dt>Od – do</dt>
            <dd>
              {formatDate(p.startDate)} – {p.endDate ? formatDate(p.endDate) : "dosud"}
            </dd>
            <dt>Kontakt</dt>
            <dd>{[p.email, p.phone].filter(Boolean).join(" · ") || "–"}</dd>
            <dt>Hodnocení</dt>
            <dd>
              <PerformanceBadge v={p.performance} /> {p.performanceNote}
            </dd>
            <dt>KiloMayo</dt>
            <dd>{p.kilomayoMemberId ? "propojeno" : <span className="badge warning">nepropojeno</span>}</dd>
          </dl>
          {p.notes && <p className="muted">{p.notes}</p>}
        </section>
        <section>
          <h2 style={{ marginTop: 0 }}>Red flags</h2>
          <FlagList flags={flags.filter((f) => f.personId === p.id)} tasks={tasks} />
        </section>
      </div>

      <h2>Smlouvy</h2>
      {contracts.length === 0 ? (
        <div className="card empty">Žádná smlouva v evidenci.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Typ</th>
                <th>Stav</th>
                <th>Platnost</th>
                <th className="num">Sazba</th>
                <th>Dokument</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td>{RELATION_LABEL[c.type]}</td>
                  <td>
                    <span className={`badge ${CONTRACT_STATUS[c.status][0]}`}>{CONTRACT_STATUS[c.status][1]}</span>
                  </td>
                  <td>
                    {formatDate(c.validFrom)} – {c.validTo ? formatDate(c.validTo) : "neurčito"}
                  </td>
                  <td className="num">
                    {c.monthlyFee ? `${formatCzk(c.monthlyFee)}/měs` : c.hourlyRate ? `${formatCzk(c.hourlyRate)}/h` : "–"}
                  </td>
                  <td>{c.driveUrl ? <a href={c.driveUrl} target="_blank" rel="noreferrer">Drive</a> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Školení a oprávnění</h2>
      {(snapshot.trainings ?? []).filter((t) => t.personId === p.id).length === 0 ? (
        <div className="card empty">Žádné školení v evidenci.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Školení</th>
                <th>Absolvováno</th>
                <th>Platí do</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot.trainings ?? [])
                .filter((t) => t.personId === p.id)
                .map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{formatDate(t.completedAt)}</td>
                    <td>
                      {t.validTo ? (
                        <span className={`badge ${t.validTo < today ? "critical" : "ok"}`}>{formatDate(t.validTo)}</span>
                      ) : (
                        "neomezeně"
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Posledních 12 měsíců</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Měsíc</th>
              <th className="num">Hodiny</th>
              <th className="num">Očekáváno{isIco ? "" : " (hrubé)"}</th>
              {isIco && <th className="num">Fakturováno</th>}
              <th className="num">Zaplaceno</th>
              <th>Platby</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const h = snapshot.workMonths.find((w) => w.personId === p.id && w.month === m)?.hours ?? 0;
              const exp = expectedAmount(p, signedContractFor(snapshot.contracts, p.id, m), h);
              const inv = snapshot.invoices.filter((i) => i.personId === p.id && i.month === m);
              const pays = snapshot.payments.filter((x) => x.personId === p.id && x.month === m);
              const paid = pays.filter((x) => x.kind !== "odvody").reduce((s, x) => s + x.amount, 0);
              if (!h && !exp && !pays.length && !inv.length) return null;
              return (
                <tr key={m}>
                  <td>
                    <Link href={`/hr/mesic/${m}`}>{monthLabel(m)}</Link>
                  </td>
                  <td className="num">{h || "–"}</td>
                  <td className="num">{formatCzk(exp)}</td>
                  {isIco && <td className="num">{inv.length ? formatCzk(inv.reduce((s, i) => s + i.amount, 0)) : "–"}</td>}
                  <td className="num">{paid ? formatCzk(paid) : "–"}</td>
                  <td className="muted">
                    {pays.map((x) => `${x.kind} ${formatDate(x.paidAt)}`).join(", ") || "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Úkoly</h2>
      <TaskList tasks={tasks.filter((t) => t.personId === p.id)} people={snapshot.people} />
      <form action={createTask} className="stack" style={{ marginTop: 12 }}>
        <input type="hidden" name="personId" value={p.id} />
        <input name="title" placeholder="Nový úkol, např. podepsat dodatek" required />
        <input name="dueDate" type="date" />
        <div>
          <button className="primary" type="submit">Přidat úkol</button>
        </div>
      </form>
    </>
  );
}
