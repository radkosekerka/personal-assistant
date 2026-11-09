import Link from "next/link";
import { bankData } from "@/lib/bank/data";
import { accountLabel, cashflow, totals } from "@/lib/bank/checks";
import { formatDate, monthLabel, monthOf } from "@/lib/dates";
import { SeverityBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined, cur = "CZK") =>
  n == null
    ? "–"
    : new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + (cur === "CZK" ? " Kč" : ` ${cur}`);

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ ucet?: string; q?: string; smer?: string; vse?: string }> }) {
  const sp = await searchParams;
  const { connections, accounts, tx, companies, flags, today } = await bankData();
  const company = new Map(companies.map((c) => [c.id, c.name]));
  const active = accounts.filter((a) => a.active);
  const sums = totals(accounts);
  const flow = cashflow(tx.filter((t) => active.some((a) => a.id === t.accountId)), accounts.map((a) => a.iban), monthOf(today));
  const maxBar = Math.max(1, ...flow.flatMap((r) => [r.income, r.costs]));

  const accId = sp.ucet ? Number(sp.ucet) : undefined;
  const q = sp.q?.trim().toLowerCase();
  const filtered = tx
    .filter((t) => (accId ? t.accountId === accId : active.some((a) => a.id === t.accountId)))
    .filter((t) => (sp.smer === "in" ? t.amount > 0 : sp.smer === "out" ? t.amount < 0 : true))
    .filter((t) =>
      q
        ? [t.counterpartyName, t.counterpartyAccount, t.message, t.note, t.variableSymbol].some((v) => v?.toLowerCase().includes(q))
        : true,
    )
  const limit = sp.vse ? 1000 : 60;
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const lastSync = connections.map((c) => c.lastSyncAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];

  if (connections.length === 0 && accounts.length === 0) {
    return (
      <>
        <h1>Finance</h1>
        <div className="card empty">
          Zatím není napojená žádná banka. <Link href="/finance/propojeni">Napojit účty KB →</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Finance</h1>
      <p className="muted">
        Zůstatky a pohyby z KB API{lastSync ? `, aktualizováno ${lastSync.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}` : ""}.
      </p>

      <div className="tiles">
        {sums.map((s) => (
          <div className="tile" key={s.currency}>
            <div className="n">{money(s.available, s.currency)}</div>
            <div className="l">disponibilně celkem · účetně {money(s.booked, s.currency)}</div>
          </div>
        ))}
        {flow.at(-1) && (
          <div className={`tile ${flow.at(-1)!.net < 0 ? "critical" : ""}`}>
            <div className="n">{money(flow.at(-1)!.net)}</div>
            <div className="l">
              cashflow {monthLabel(flow.at(-1)!.month)} · +{money(flow.at(-1)!.income)} / −{money(flow.at(-1)!.costs)}
            </div>
          </div>
        )}
      </div>

      {flags.length > 0 && (
        <>
          <h2>Red flags</h2>
          <div className="card">
            <ul className="flags">
              {flags.map((f) => (
                <li key={f.key}>
                  <SeverityBadge s={f.severity} />
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

      <h2>Účty</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Firma</th>
              <th>Účet</th>
              <th className="num">Disponibilní</th>
              <th className="num">Účetní</th>
              <th>Stav k</th>
            </tr>
          </thead>
          <tbody>
            {active.map((a) => (
              <tr key={a.id}>
                <td>{a.companyId ? company.get(a.companyId) : "–"}</td>
                <td>
                  <Link href={`/finance?ucet=${a.id}`}>{a.name ?? a.product ?? "Účet"}</Link>
                  <div className="muted" style={{ fontSize: 12 }}>{a.iban}</div>
                </td>
                <td className="num" style={{ color: a.lowBalanceLimit != null && (a.availableBalance ?? 0) < a.lowBalanceLimit ? "var(--critical)" : undefined }}>
                  {money(a.availableBalance, a.currency)}
                </td>
                <td className="num">{money(a.bookedBalance, a.currency)}</td>
                <td className="muted">{a.balanceAt ? a.balanceAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Cashflow posledních 6 měsíců (CZK, bez převodů mezi vlastními účty)</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Měsíc</th>
              <th style={{ width: "40%" }}>Příjmy a výdaje</th>
              <th className="num">Příjmy</th>
              <th className="num">Výdaje</th>
              <th className="num">Rozdíl</th>
            </tr>
          </thead>
          <tbody>
            {flow.map((r) => (
              <tr key={r.month}>
                <td>{monthLabel(r.month)}</td>
                <td>
                  <div className="bar in">
                    <span style={{ width: `${(r.income / maxBar) * 100}%` }} />
                  </div>
                  <div className="bar out">
                    <span style={{ width: `${(r.costs / maxBar) * 100}%` }} />
                  </div>
                </td>
                <td className="num">{money(Math.round(r.income))}</td>
                <td className="num">{money(Math.round(r.costs))}</td>
                <td className="num" style={{ color: r.net < 0 ? "var(--critical)" : undefined }}>
                  {money(Math.round(r.net))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="pohyby">Pohyby{accId && accById.get(accId) ? `: ${accountLabel(accById.get(accId)!)}` : ""}</h2>
      <form className="txform" method="get" action="/finance#pohyby">
        <select name="ucet" defaultValue={sp.ucet ?? ""}>
          <option value="">Všechny účty</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a)}
            </option>
          ))}
        </select>
        <select name="smer" defaultValue={sp.smer ?? ""}>
          <option value="">Příjmy i výdaje</option>
          <option value="in">Jen příjmy</option>
          <option value="out">Jen výdaje</option>
        </select>
        <input name="q" placeholder="Hledat (protistrana, VS, zpráva)" defaultValue={sp.q ?? ""} />
        <button type="submit">Filtrovat</button>
      </form>
      {filtered.length === 0 ? (
        <div className="card empty">Žádné pohyby.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Protistrana</th>
                <th>VS</th>
                <th>Zpráva</th>
                {!accId && <th>Účet</th>}
                <th className="num">Částka</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((t) => (
                <tr key={t.id}>
                  <td>
                    {formatDate(t.bookingDate ?? t.valueDate)}
                    {t.status === "PDNG" && <div><span className="badge neutral">blokace</span></div>}
                  </td>
                  <td>
                    {t.counterpartyName ?? (t.type === "CARD" ? "Platba kartou" : "–")}
                    {t.counterpartyAccount && <div className="muted" style={{ fontSize: 12 }}>{t.counterpartyAccount}</div>}
                  </td>
                  <td className="muted">{t.variableSymbol ?? ""}</td>
                  <td className="muted">{[t.message, t.note].filter(Boolean).join(" · ")}</td>
                  {!accId && <td className="muted">{accById.get(t.accountId)?.name ?? `…${accById.get(t.accountId)?.iban.slice(-4)}`}</td>}
                  <td className="num" style={{ color: t.amount < 0 ? "var(--critical)" : "var(--ok)" }}>
                    {t.amount > 0 ? "+" : ""}
                    {money(t.amount, t.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > limit && (
        <p>
          <Link href={`/finance?${new URLSearchParams({ ...(sp.ucet ? { ucet: sp.ucet } : {}), ...(sp.q ? { q: sp.q } : {}), ...(sp.smer ? { smer: sp.smer } : {}), vse: "1" })}#pohyby`}>
            Zobrazit všech {filtered.length} pohybů →
          </Link>
        </p>
      )}
      <p className="muted" style={{ fontSize: 13 }}>Pohyby za posledních ~13 měsíců.</p>
    </>
  );
}
