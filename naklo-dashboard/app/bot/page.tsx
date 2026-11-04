import { botData } from "@/lib/bot/data";
import { MODULE_LABEL, type ModuleKey } from "@/lib/bot/plan";
import { decideOutbox, runBotNow, saveOwner } from "@/app/actions";
import { formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  ke_schvaleni: ["warning", "Ke schválení"],
  schvaleno: ["ok", "Schváleno, čeká na napojení kanálu"],
  zamitnuto: ["neutral", "Zamítnuto"],
  odeslano: ["ok", "Odesláno"],
};
const MODULE_OPTIONS = ["*", ...Object.keys(MODULE_LABEL)] as const;
const modLabel = (m: string) => (m === "*" ? "Vše ostatní" : MODULE_LABEL[m as ModuleKey] ?? m);

export default async function BotPage() {
  const { brief, outbox, owners, today } = await botData();
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  return (
    <>
      <div className="brief-head">
        <h1>Centrální bot</h1>
        <form action={runBotNow}>
          <button className="primary" type="submit">Spustit teď</button>
        </form>
      </div>
      <p className="muted">
        Každé ráno v 6:00 projde všechny moduly, založí úkoly z red flagů, přidělí je, uzavře vyřešené, napíše plán dne a
        připraví zprávy lidem. Nic sám neodesílá a nikdy nekontaktuje účetní ani zákazníky.
      </p>

      <h2>Plán dne {brief ? `· ${formatDate(brief.date)}` : ""}</h2>
      <div className="card" style={{ padding: 16 }}>
        {brief ? (
          <>
            <div className="brief">{brief.text}</div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              Sestavil: {brief.generatedBy === "gemini" ? "Gemini" : "pravidla (bez AI)"}
            </p>
          </>
        ) : (
          <span className="muted">Bot dnes ještě neběžel.</span>
        )}
      </div>

      <h2>Zprávy lidem ke schválení ({outbox.filter((m) => m.status === "ke_schvaleni").length})</h2>
      {outbox.length === 0 ? (
        <div className="card empty">Dnes žádné zprávy. Zprávy vznikají jen pro lidi s vyplněným WhatsAppem nebo e-mailem.</div>
      ) : (
        <div className="grid2 outbox">
          {outbox.map((m) => (
            <section key={m.id} className="card" style={{ padding: 14 }}>
              <div className="brief-head">
                <strong>{ownerName.get(m.ownerId)} · {m.channel === "whatsapp" ? "WhatsApp" : "e-mail"}</strong>
                <span className={`badge ${STATUS[m.status][0]}`}>{STATUS[m.status][1]}</span>
              </div>
              {m.status === "ke_schvaleni" ? (
                <form action={decideOutbox} className="stack" style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={m.id} />
                  <textarea name="text" defaultValue={m.text} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="primary" type="submit" name="status" value="schvaleno">Schválit</button>
                    <button type="submit" name="status" value="zamitnuto">Zamítnout</button>
                  </div>
                </form>
              ) : (
                <div className="brief" style={{ marginTop: 8, fontSize: 14 }}>{m.text}</div>
              )}
            </section>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 13 }}>
        Odesílání se zapne po napojení WhatsApp Business API (nové číslo) nebo Gmailu. Do té doby zůstávají schválené zprávy tady.
      </p>

      <h2>Komu bot rozděluje úkoly</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Jméno</th>
              <th>Role</th>
              <th>Moduly</th>
              <th>WhatsApp</th>
              <th>E-mail</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.id} style={o.active ? undefined : { opacity: 0.5 }}>
                <td>{o.name}</td>
                <td>{o.role}</td>
                <td>{o.modules.map(modLabel).join(", ")}</td>
                <td>{o.whatsapp}</td>
                <td>{o.email}</td>
                <td>
                  <form action={saveOwner}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="name" value={o.name} />
                    {o.role && <input type="hidden" name="role" value={o.role} />}
                    {o.modules.map((m) => <input key={m} type="hidden" name="modules" value={m} />)}
                    {o.whatsapp && <input type="hidden" name="whatsapp" value={o.whatsapp} />}
                    {o.email && <input type="hidden" name="email" value={o.email} />}
                    <input type="hidden" name="active" value={o.active ? "off" : "on"} />
                    <button type="submit">{o.active ? "Vypnout" : "Zapnout"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Přidat člověka</h3>
      <form action={saveOwner} className="stack">
        <input name="name" placeholder="Jméno" required />
        <input name="role" placeholder="Role (vedoucí bistra, eventy…)" />
        <div className="chips">
          {MODULE_OPTIONS.map((m) => (
            <label key={m} style={{ fontSize: 14 }}>
              <input type="checkbox" name="modules" value={m} /> {modLabel(m)}
            </label>
          ))}
        </div>
        <input name="whatsapp" placeholder="WhatsApp (+420…)" />
        <input name="email" type="email" placeholder="E-mail" />
        <div>
          <button className="primary" type="submit">Uložit</button>
        </div>
      </form>
      <p className="muted" style={{ fontSize: 13 }}>Dnes je {formatDate(today)}.</p>
    </>
  );
}
