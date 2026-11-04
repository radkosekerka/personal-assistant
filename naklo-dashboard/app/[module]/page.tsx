import Link from "next/link";
import { notFound } from "next/navigation";
import { MODULES } from "@/lib/modules";
import { UNITS, byCategory, cashState, monthSummary, trend, type Unit } from "@/lib/units";
import { unitData } from "@/lib/units/data";
import { addMonths, formatCzk, formatDate, monthLabel, monthOf } from "@/lib/dates";
import { addCashCount, addTransaction } from "@/app/actions";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { hotove: "hotově", karta: "karta", prevod: "převod", online: "online" };

function Soon({ module }: { module: string }) {
  const m = MODULES.find((x) => x.key === module && !x.live);
  if (!m) notFound();
  return (
    <>
      <h1>{m.name}</h1>
      <p>{m.summary}</p>
      <div className="card empty">Modul se připravuje. Data budou z: {m.sources.join(", ")}.</div>
    </>
  );
}

function Categories({ rows, total }: { rows: { category: string; amount: number }[]; total: number }) {
  if (rows.length === 0) return <div className="card empty">Nic.</div>;
  return (
    <div className="card">
      <ul className="flags">
        {rows.map((r) => (
          <li key={r.category}>
            <div className="body">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{r.category}</span>
                <span className="num">{formatCzk(r.amount)}</span>
              </div>
              <div className="bar">
                <span style={{ width: `${Math.round((r.amount / Math.max(total, 1)) * 100)}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { module } = await params;
  if (!(UNITS as readonly string[]).includes(module)) return <Soon module={module} />;
  const unit = module as Unit;
  const def = MODULES.find((x) => x.key === unit)!;
  const { tx, counts, today, flags } = await unitData(unit);
  const sp = await searchParams;
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : monthOf(today);

  const sum = monthSummary(tx, month);
  const prevSum = monthSummary(tx, addMonths(month, -1));
  const cash = cashState(tx, counts);
  const t6 = trend(tx, month, 6);
  const maxBar = Math.max(1, ...t6.flatMap((x) => [x.income, x.costs]));
  const incomeCats = byCategory(tx, month, "prijem");
  const costCats = byCategory(tx, month, "naklad");
  const monthTx = tx.filter((t) => monthOf(t.date) === month);
  const running = month === monthOf(today);
  const delta = (a: number, b: number) =>
    running
      ? `zatím za ${Number(today.slice(8))} dní`
      : b
        ? `${a >= b ? "+" : ""}${Math.round(((a - b) / Math.abs(b)) * 100)} % proti min. měsíci`
        : "";

  return (
    <>
      <div className="monthnav">
        <h1 style={{ margin: 0 }}>{def.name}</h1>
        <Link href={`/${unit}?m=${addMonths(month, -1)}`}>←</Link>
        <strong>{monthLabel(month)}</strong>
        <Link href={`/${unit}?m=${addMonths(month, 1)}`}>→</Link>
      </div>

      <div className="tiles">
        <div className="tile">
          <div className="n">{formatCzk(sum.income)}</div>
          <div className="l">příjmy · {delta(sum.income, prevSum.income)}</div>
        </div>
        <div className="tile">
          <div className="n">{formatCzk(sum.costs)}</div>
          <div className="l">náklady · {delta(sum.costs, prevSum.costs)}</div>
        </div>
        <div className={`tile ${sum.result < 0 ? "critical" : ""}`}>
          <div className="n" style={sum.result >= 0 ? { color: "var(--ok)" } : undefined}>
            {formatCzk(sum.result)}
          </div>
          <div className="l">
            výsledek
            {running ? " · náklady se často účtují až ke konci měsíce" : sum.income ? ` · marže ${Math.round((sum.result / sum.income) * 100)} %` : ""}
          </div>
        </div>
        <a className={`tile ${cash.lastDifference && Math.abs(cash.lastDifference) > 200 ? "critical" : ""}`} href="#pokladna">
          <div className="n">{formatCzk(cash.expected)}</div>
          <div className="l">
            v pokladně dnes (odhad) ·{" "}
            {cash.lastCount ? `přepočet ${formatDate(cash.lastCount.date)}` : "nikdy nepřepočítaná"}
          </div>
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
                    {f.title}
                    {f.detail && <div className="detail">{f.detail}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <h2>Posledních 6 měsíců</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Měsíc</th>
              <th style={{ width: "40%" }}>Příjmy a náklady</th>
              <th className="num">Příjmy</th>
              <th className="num">Náklady</th>
              <th className="num">Výsledek</th>
            </tr>
          </thead>
          <tbody>
            {t6.map((r) => (
              <tr key={r.month}>
                <td>
                  <Link href={`/${unit}?m=${r.month}`}>{monthLabel(r.month)}</Link>
                </td>
                <td>
                  <div className="bar in">
                    <span style={{ width: `${(r.income / maxBar) * 100}%` }} />
                  </div>
                  <div className="bar out">
                    <span style={{ width: `${(r.costs / maxBar) * 100}%` }} />
                  </div>
                </td>
                <td className="num">{formatCzk(r.income)}</td>
                <td className="num">{formatCzk(r.costs)}</td>
                <td className="num" style={{ color: r.result < 0 ? "var(--critical)" : undefined }}>
                  {formatCzk(r.result)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        <span className="legend in" /> příjmy <span className="legend out" /> náklady
      </p>

      <div className="grid2">
        <section>
          <h2>Příjmy podle kategorií</h2>
          <Categories rows={incomeCats} total={sum.income} />
        </section>
        <section>
          <h2>Náklady podle kategorií</h2>
          <Categories rows={costCats} total={sum.costs} />
        </section>
      </div>

      <h2 id="pokladna">Pokladna</h2>
      <div className="grid2">
        <section>
          <dl className="facts">
            <dt>Poslední přepočet</dt>
            <dd>
              {cash.lastCount
                ? `${formatCzk(cash.lastCount.amount)} · ${formatDate(cash.lastCount.date)}${cash.lastCount.countedBy ? ` · ${cash.lastCount.countedBy}` : ""}`
                : "–"}
            </dd>
            <dt>Hotovost od přepočtu</dt>
            <dd>
              +{formatCzk(cash.cashIn)} / −{formatCzk(cash.cashOut)}
            </dd>
            <dt>Má být v pokladně</dt>
            <dd>
              <strong>{formatCzk(cash.expected)}</strong>
            </dd>
            <dt>Rozdíl při posl. přepočtu</dt>
            <dd>
              {cash.lastDifference == null ? (
                "–"
              ) : (
                <span className={`badge ${Math.abs(cash.lastDifference) > 200 ? "critical" : "ok"}`}>
                  {cash.lastDifference > 0 ? "+" : ""}
                  {formatCzk(cash.lastDifference)}
                </span>
              )}
            </dd>
          </dl>
          <h3>Zapsat přepočet</h3>
          <form action={addCashCount} className="stack">
            <input type="hidden" name="unit" value={unit} />
            <input type="date" name="date" defaultValue={today} required />
            <input type="number" name="amount" placeholder="Napočítaná hotovost v Kč" min={0} required />
            <input name="note" placeholder="Poznámka" />
            <div>
              <button className="primary" type="submit">Uložit přepočet</button>
            </div>
          </form>
        </section>
        <section>
          <h3 style={{ marginTop: 0 }}>Historie přepočtů</h3>
          {counts.length === 0 ? (
            <div className="card empty">Zatím žádný přepočet.</div>
          ) : (
            <table>
              <tbody>
                {counts.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.date)}</td>
                    <td className="num">{formatCzk(c.amount)}</td>
                    <td className="muted">{c.countedBy ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <h2>Pohyby za {monthLabel(month)}</h2>
      <form action={addTransaction} className="txform">
        <input type="hidden" name="unit" value={unit} />
        <input type="date" name="date" defaultValue={today} required />
        <select name="kind" defaultValue="prijem">
          <option value="prijem">Příjem</option>
          <option value="naklad">Náklad</option>
        </select>
        <input name="category" placeholder="Kategorie (Tržba, Zboží, Mzdy…)" required list={`cats-${unit}`} />
        <datalist id={`cats-${unit}`}>
          {[...new Set(tx.map((t) => t.category))].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <input type="number" name="amount" placeholder="Kč" min={1} required />
        <select name="method" defaultValue="hotove">
          <option value="hotove">Hotově</option>
          <option value="karta">Karta</option>
          <option value="prevod">Převod</option>
          <option value="online">Online</option>
        </select>
        <input name="note" placeholder="Poznámka" />
        <button className="primary" type="submit">Přidat</button>
      </form>
      {monthTx.length === 0 ? (
        <div className="card empty">Žádné pohyby.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Kategorie</th>
                <th>Platba</th>
                <th>Zdroj</th>
                <th className="num">Částka</th>
                <th>Poznámka</th>
              </tr>
            </thead>
            <tbody>
              {monthTx.slice(0, 100).map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td>{t.category}</td>
                  <td>{METHOD[t.method]}</td>
                  <td className="muted">{t.source}</td>
                  <td className="num" style={{ color: t.kind === "naklad" ? "var(--critical)" : "var(--ok)" }}>
                    {t.kind === "naklad" ? "−" : "+"}
                    {formatCzk(t.amount)}
                  </td>
                  <td className="muted">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13 }}>Zdroje dat do budoucna: {def.sources.join(", ")}.</p>
    </>
  );
}
