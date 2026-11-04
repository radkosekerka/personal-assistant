import Link from "next/link";
import { notFound } from "next/navigation";
import { dashboardData } from "@/lib/data";
import { monthRows } from "@/lib/checks";
import { addMonths, formatCzk, monthLabel } from "@/lib/dates";
import { MonthStatus, RELATION_LABEL } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const { snapshot } = await dashboardData();
  const rows = monthRows(snapshot, month).filter((r) => r.status !== "no-work");
  const total = {
    hours: rows.reduce((s, r) => s + r.hours, 0),
    expected: rows.reduce((s, r) => s + (r.expected ?? 0), 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
  };

  return (
    <>
      <div className="monthnav">
        <Link href={`/hr/mesic/${addMonths(month, -1)}`}>←</Link>
        <h1 style={{ margin: 0 }}>{monthLabel(month)}</h1>
        <Link href={`/hr/mesic/${addMonths(month, 1)}`}>→</Link>
      </div>
      <p className="muted">
        Očekávaná částka je paušál, nebo hodiny × sazba ze smlouvy. U zaměstnanců jde o hrubou mzdu, zaplaceno je čistá
        výplata z banky, takže rozdíl je normální.
      </p>
      {rows.length === 0 ? (
        <div className="card empty">Za tento měsíc nejsou žádné hodiny ani platby.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Jméno</th>
                <th>Typ</th>
                <th className="num">Hodiny</th>
                <th className="num">Sazba</th>
                <th className="num">Očekáváno</th>
                <th className="num">Faktura</th>
                <th className="num">Zaplaceno</th>
                <th>Stav</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rate = r.contract?.monthlyFee ?? r.person.monthlyFee
                  ? `${formatCzk(r.contract?.monthlyFee ?? r.person.monthlyFee)}/měs`
                  : r.contract?.hourlyRate ?? r.person.hourlyRate
                    ? `${formatCzk(r.contract?.hourlyRate ?? r.person.hourlyRate)}/h`
                    : "–";
                return (
                  <tr key={r.person.id}>
                    <td>
                      <Link href={`/hr/lide/${r.person.id}`}>{r.person.fullName}</Link>
                    </td>
                    <td>{r.person.relationType ? RELATION_LABEL[r.person.relationType] : "?"}</td>
                    <td className="num">{r.hours || "–"}</td>
                    <td className="num">{rate}</td>
                    <td className="num">{formatCzk(r.expected)}</td>
                    <td className="num">{r.person.relationType === "ICO" ? formatCzk(r.invoiced) : ""}</td>
                    <td className="num">{r.paid ? formatCzk(r.paid) : "–"}</td>
                    <td>
                      <MonthStatus s={r.status} />
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <strong>Celkem</strong>
                </td>
                <td />
                <td className="num">
                  <strong>{total.hours}</strong>
                </td>
                <td />
                <td className="num">
                  <strong>{formatCzk(total.expected)}</strong>
                </td>
                <td />
                <td className="num">
                  <strong>{formatCzk(total.paid)}</strong>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
