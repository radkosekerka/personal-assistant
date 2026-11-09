import { bankData } from "@/lib/bank/data";
import { renewBankConsent, saveBankAccount, startBankConnection, syncBanksNow } from "@/app/actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  registrace: ["čeká na schválení v KB", "warning"],
  autorizace: ["čeká na autorizaci", "warning"],
  aktivni: ["aktivní", "ok"],
  vyprselo: ["souhlas vypršel", "critical"],
  chyba: ["chyba", "critical"],
};

const REQUIRED_ENV = ["BANK_ENCRYPTION_KEY", "KB_API_KEY_OAUTH", "KB_API_KEY_ADAA", "KB_SOFTWARE_STATEMENT", "KB_REDIRECT_URI"];

const dt = (d: Date | null) => (d ? d.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) : "–");

export default async function BankConnectionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; chyba?: string }> }) {
  const sp = await searchParams;
  const { connections, accounts, companies } = await bankData();
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);

  return (
    <>
      <h1>Bankovní propojení</h1>
      <p className="muted">
        Komerční banka přes KB API (Account Direct Access). Jen čtení: zůstatky a pohyby, žádné platby. Souhlas platí 12 měsíců, pak ho
        stačí obnovit přihlášením do KB.
      </p>

      {sp.ok && <div className="card" style={{ borderColor: "var(--ok)" }}>Propojení je aktivní a první data jsou stažená.</div>}
      {sp.chyba && <div className="card" style={{ borderColor: "var(--critical)" }}>Nepovedlo se: {sp.chyba}</div>}

      {missing.length > 0 && (
        <div className="card">
          <strong>Napojení ještě není nastavené.</strong> Chybí proměnné prostředí: {missing.join(", ")}. Postup je v README (sekce Banka).
        </div>
      )}

      <h2>Propojení</h2>
      {connections.length === 0 ? (
        <div className="card empty">Zatím žádné.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Klient KB</th>
                <th>Stav</th>
                <th>Souhlas platí do</th>
                <th>Poslední stažení</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.label}
                    {c.lastError && <div className="muted" style={{ fontSize: 12 }}>{c.lastError}</div>}
                  </td>
                  <td>
                    <span className={`badge ${STATUS[c.status][1]}`}>{STATUS[c.status][0]}</span>
                  </td>
                  <td>{c.refreshTokenExpiresAt ? c.refreshTokenExpiresAt.toLocaleDateString("cs-CZ") : "–"}</td>
                  <td>{dt(c.lastSyncAt)}</td>
                  <td>
                    {c.clientId && (
                      <form action={renewBankConsent} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit">Obnovit souhlas</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={syncBanksNow} className="inline" style={{ marginTop: 8 }}>
        <button type="submit">Stáhnout teď</button>{" "}
        <span className="muted" style={{ fontSize: 13 }}>
          Pohyby jde stáhnout jednou za hodinu, zůstatky kdykoli. Automaticky každé ráno.
        </span>
      </form>

      <h2>Napojit další firmu nebo účet</h2>
      <form action={startBankConnection} className="stack" style={{ maxWidth: 480 }}>
        <input name="label" placeholder="Kdo je klientem KB, např. Wake Surf Náklo s.r.o." required />
        <select name="companyId" defaultValue="">
          <option value="">Firma v dashboardu (nepovinné)</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div>
          <button className="primary" type="submit" disabled={missing.length > 0}>
            Pokračovat do KB
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Přesměruje tě do přihlášení KB. Tam vybereš účty, potvrdíš KB klíčem a pak ještě jednou potvrdíš oprávnění. Musí to udělat
          člověk s přístupem k účtům firmy v MojeBanka Business (nebo MojeBanka u OSVČ).
        </p>
      </form>

      {accounts.length > 0 && (
        <>
          <h2>Nastavení účtů</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Účet</th>
                  <th>Firma</th>
                  <th>Hlídat zůstatek pod</th>
                  <th>Zobrazovat</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.name ?? a.product ?? "Účet"}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {a.iban} · {a.currency}
                      </div>
                    </td>
                    <td colSpan={4}>
                      <form action={saveBankAccount} className="txform" style={{ margin: 0 }}>
                        <input type="hidden" name="id" value={a.id} />
                        <select name="companyId" defaultValue={a.companyId ?? ""}>
                          <option value="">–</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <input type="number" name="lowBalanceLimit" min={0} placeholder="Hranice" defaultValue={a.lowBalanceLimit ?? ""} />
                        <label>
                          <input type="checkbox" name="active" defaultChecked={a.active} /> zobrazovat
                        </label>
                        <button type="submit">Uložit</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
