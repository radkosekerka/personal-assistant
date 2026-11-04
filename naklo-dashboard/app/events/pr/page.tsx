import Link from "next/link";
import { eventsData } from "@/lib/events/data";
import { reviewStats } from "@/lib/events/pr";
import { addDays, formatDate } from "@/lib/dates";
import { addPrItem, setPrStatus } from "@/app/actions";
import type { PrItem } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const stars = (n: number | null) => (n == null ? "" : "★".repeat(n) + "☆".repeat(5 - n));

function Done({ item, to = "vyrizeno", label = "Vyřízeno" }: { item: PrItem; to?: string; label?: string }) {
  return (
    <form action={setPrStatus} className="inline">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="status" value={to} />
      <button type="submit">{label}</button>
    </form>
  );
}

function ItemList({ items, empty, action }: { items: PrItem[]; empty: string; action?: boolean }) {
  if (items.length === 0) return <div className="card empty">{empty}</div>;
  return (
    <div className="card">
      <ul className="flags">
        {items.map((i) => (
          <li key={i.id}>
            <span className="badge neutral">{i.channel}</span>
            <div className="body">
              <div>
                {i.rating != null && (
                  <span style={{ color: i.rating <= 3 ? "var(--critical)" : "var(--warning)", marginRight: 6 }}>{stars(i.rating)}</span>
                )}
                {i.url ? (
                  <a href={i.url} target="_blank" rel="noreferrer">
                    {i.title ?? i.author ?? "Odkaz"}
                  </a>
                ) : (
                  (i.title ?? i.author)
                )}
              </div>
              <div className="detail">
                {formatDate(iso(i.at))}
                {i.author && i.title ? ` · ${i.author}` : ""}
                {i.text ? ` · ${i.text}` : ""}
                {i.reach ? ` · dosah ${i.reach.toLocaleString("cs-CZ")}` : ""}
              </div>
            </div>
            {action && i.status === "nove" && <Done item={i} />}
            {i.status === "planovano" && <Done item={i} to="publikovano" label="Publikováno" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function PrPage() {
  const { pr, events, flags, today } = await eventsData();
  const prOnly = flags.filter((f) => f.href.startsWith("/events/pr"));
  const stats = reviewStats(pr);
  const last30 = reviewStats(pr, addDays(today, -30));
  const reviews = pr.filter((i) => i.kind === "recenze");
  const inbox = pr.filter((i) => (i.kind === "zprava" || i.kind === "komentar") && i.status === "nove");
  const mentions = pr.filter((i) => i.kind === "zminka");
  const posts = pr.filter((i) => i.kind === "prispevek");
  const upcoming = events.filter((e) => e.status === "potvrzeno" && e.startDate && e.startDate >= today);
  const eventName = new Map(events.map((e) => [e.id, `${e.type ?? "Akce"} ${e.startDate ? formatDate(e.startDate) : ""}`]));

  return (
    <>
      <h1>PR</h1>
      <div className="tiles">
        <a className="tile" href="#recenze">
          <div className="n">{stats.average ?? "–"}★</div>
          <div className="l">
            průměr z {stats.count} recenzí · za 30 dní {last30.average ?? "–"}★ ({last30.count})
          </div>
        </a>
        <a className={`tile ${stats.unanswered ? "warning" : ""}`} href="#recenze">
          <div className="n">{stats.unanswered}</div>
          <div className="l">recenzí bez odpovědi</div>
        </a>
        <a className={`tile ${inbox.length ? "critical" : ""}`} href="#zpravy">
          <div className="n">{inbox.length}</div>
          <div className="l">zpráv a komentářů bez odpovědi</div>
        </a>
        <a className="tile" href="#media">
          <div className="n">{mentions.length}</div>
          <div className="l">zmínek v médiích</div>
        </a>
        <a className="tile" href="#prispevky">
          <div className="n">{posts.filter((p) => p.status === "planovano").length}</div>
          <div className="l">naplánovaných příspěvků</div>
        </a>
      </div>

      {prOnly.length > 0 && (
        <>
          <h2>Red flags</h2>
          <div className="card">
            <ul className="flags">
              {prOnly.map((f) => (
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

      <h2 id="zpravy">Zprávy a komentáře bez odpovědi</h2>
      <ItemList items={inbox} empty="Všechno zodpovězené." action />

      <h2 id="recenze">Recenze</h2>
      <p className="muted">
        {stats.byChannel.map((c) => `${c.channel}: ${c.average}★ (${c.count})`).join(" · ") || "Zatím žádné recenze."}
      </p>
      <ItemList items={reviews.slice(0, 20)} empty="Žádné recenze." action />

      <h2 id="prispevky">Příspěvky a propagace akcí</h2>
      <ItemList
        items={posts.map((p) => ({ ...p, text: [p.eventId ? eventName.get(p.eventId) : null, p.text].filter(Boolean).join(" · ") || null }))}
        empty="Žádné příspěvky."
      />

      <h2 id="media">Zmínky v médiích</h2>
      <ItemList items={mentions} empty="Žádné zmínky." />

      <h2>Přidat zmínku nebo příspěvek</h2>
      <form action={addPrItem} className="txform">
        <select name="kind" defaultValue="prispevek">
          <option value="prispevek">Příspěvek</option>
          <option value="zminka">Zmínka v médiích</option>
        </select>
        <input name="channel" placeholder="Kanál (Instagram, iDNES…)" required />
        <input type="date" name="at" defaultValue={today} required />
        <input name="title" placeholder="Název" required />
        <input name="url" type="url" placeholder="Odkaz" />
        <select name="eventId" defaultValue="">
          <option value="">Bez akce</option>
          {upcoming.map((e) => (
            <option key={e.id} value={e.id}>
              {eventName.get(e.id)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue="planovano">
          <option value="planovano">Plánováno</option>
          <option value="publikovano">Publikováno</option>
        </select>
        <button className="primary" type="submit">Přidat</button>
      </form>
      <p className="muted" style={{ fontSize: 13 }}>
        Recenze, zprávy a komentáře se budou plnit automaticky z Google Business Profile, Facebooku a Instagramu (Meta Graph
        API) a z e-mailových upozornění Mapy.cz. Zatím jsou demo data.
      </p>
    </>
  );
}
