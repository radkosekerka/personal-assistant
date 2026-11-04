import Link from "next/link";
import { dashboardData } from "@/lib/data";
import { contractCovers } from "@/lib/checks";
import { addMonths, formatCzk, formatDate, monthOf } from "@/lib/dates";
import { RELATION_LABEL } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ vse?: string }> }) {
  const { vse } = await searchParams;
  const { snapshot, flags, companies, today } = await dashboardData();
  const thisMonth = monthOf(today);
  const lastMonth = addMonths(thisMonth, -1);
  const year = today.slice(0, 4);
  const company = new Map(companies.map((c) => [c.id, c.name]));
  const people = snapshot.people.filter((p) => vse || p.active);

  return (
    <>
      <h1>Lidé</h1>
      <p className="muted">
        {people.length} {vse ? "celkem" : "aktivních"} ·{" "}
        <Link href={vse ? "/lide" : "/lide?vse=1"}>{vse ? "jen aktivní" : "zobrazit i neaktivní"}</Link>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Jméno</th>
              <th>Typ</th>
              <th>Firma</th>
              <th>Smlouva</th>
              <th className="num">Sazba</th>
              <th className="num">Hodiny {lastMonth.slice(5)}/{lastMonth.slice(2, 4)}</th>
              <th className="num">Hodiny {year}</th>
              <th className="num">Zaplaceno {year}</th>
              <th>Red flags</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const own = snapshot.contracts.filter((c) => c.personId === p.id);
              const valid = own.find((c) => c.status === "signed" && contractCovers(c, today, today));
              const draft = own.find((c) => c.status === "draft");
              const hLast = snapshot.workMonths.find((w) => w.personId === p.id && w.month === lastMonth)?.hours ?? 0;
              const hYear = snapshot.workMonths
                .filter((w) => w.personId === p.id && w.month.startsWith(year))
                .reduce((s, w) => s + w.hours, 0);
              const paidYear = snapshot.payments
                .filter((x) => x.personId === p.id && x.month.startsWith(year) && x.kind !== "odvody")
                .reduce((s, x) => s + x.amount, 0);
              const pf = flags.filter((f) => f.personId === p.id);
              const crit = pf.filter((f) => f.severity === "critical").length;
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/hr/lide/${p.id}`}>{p.fullName}</Link>
                    {p.position && <div className="muted">{p.position}</div>}
                  </td>
                  <td>{p.relationType ? RELATION_LABEL[p.relationType] : <span className="badge warning">?</span>}</td>
                  <td>{p.companyId ? company.get(p.companyId) : "–"}</td>
                  <td>
                    {valid ? (
                      <span className="badge ok">
                        {valid.validTo ? `do ${formatDate(valid.validTo)}` : "neurčitá"}
                      </span>
                    ) : draft ? (
                      <span className="badge warning">návrh</span>
                    ) : (
                      <span className="badge critical">chybí</span>
                    )}
                  </td>
                  <td className="num">
                    {p.monthlyFee ? `${formatCzk(p.monthlyFee)}/měs` : p.hourlyRate ? `${formatCzk(p.hourlyRate)}/h` : "–"}
                  </td>
                  <td className="num">{hLast || "–"}</td>
                  <td className="num">{hYear || "–"}</td>
                  <td className="num">{paidYear ? formatCzk(paidYear) : "–"}</td>
                  <td>
                    {pf.length === 0 ? (
                      <span className="badge ok">OK</span>
                    ) : (
                      <span className={`badge ${crit ? "critical" : "warning"}`}>{pf.length}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
