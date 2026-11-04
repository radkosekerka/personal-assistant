import Link from "next/link";
import { botData } from "@/lib/bot/data";
import { MODULE_LABEL, sortTasks, type ModuleKey } from "@/lib/bot/plan";
import { TaskList } from "@/components/ui";
import { createTask } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function AllTasks({ searchParams }: { searchParams: Promise<{ kdo?: string; modul?: string }> }) {
  const sp = await searchParams;
  const { tasks, owners, today } = await botData();
  const match = (t: (typeof tasks)[number]) =>
    (!sp.kdo || (sp.kdo === "nikdo" ? t.ownerId == null : String(t.ownerId) === sp.kdo)) && (!sp.modul || t.module === sp.modul);
  const open = sortTasks(tasks.filter((t) => t.status === "open" && match(t)), today);
  const done = tasks.filter((t) => t.status === "done" && match(t)).slice(0, 20);
  const q = (k: string, v?: string) => {
    const p = new URLSearchParams({ ...(sp.kdo ? { kdo: sp.kdo } : {}), ...(sp.modul ? { modul: sp.modul } : {}) });
    if (v) p.set(k, v);
    else p.delete(k);
    const s = p.toString();
    return `/ukoly${s ? `?${s}` : ""}`;
  };
  const count = (f: (t: (typeof tasks)[number]) => boolean) => tasks.filter((t) => t.status === "open" && f(t)).length;

  return (
    <>
      <h1>Úkoly</h1>
      <p className="muted">Úkoly ze všech modulů. Bot je každé ráno zakládá z red flagů, přiděluje a uzavírá ty, které se vyřešily.</p>
      <div className="chips" style={{ marginBottom: 8 }}>
        <Link href={q("kdo")} className={!sp.kdo ? "on" : ""}>Všichni</Link>
        {owners.map((o) => (
          <Link key={o.id} href={q("kdo", String(o.id))} className={sp.kdo === String(o.id) ? "on" : ""}>
            {o.name} ({count((t) => t.ownerId === o.id)})
          </Link>
        ))}
        <Link href={q("kdo", "nikdo")} className={sp.kdo === "nikdo" ? "on" : ""}>Nepřidělené ({count((t) => t.ownerId == null)})</Link>
      </div>
      <div className="chips" style={{ marginBottom: 16 }}>
        <Link href={q("modul")} className={!sp.modul ? "on" : ""}>Všechny moduly</Link>
        {(Object.keys(MODULE_LABEL) as ModuleKey[]).map((m) => (
          <Link key={m} href={q("modul", m)} className={sp.modul === m ? "on" : ""}>
            {MODULE_LABEL[m]} ({count((t) => t.module === m)})
          </Link>
        ))}
      </div>

      <form action={createTask} className="txform">
        <input name="title" placeholder="Nový úkol" required />
        <select name="module" defaultValue={sp.modul ?? "obecne"}>
          {(Object.keys(MODULE_LABEL) as ModuleKey[]).map((m) => (
            <option key={m} value={m}>{MODULE_LABEL[m]}</option>
          ))}
        </select>
        <select name="ownerId" defaultValue={sp.kdo && sp.kdo !== "nikdo" ? sp.kdo : ""}>
          <option value="">Nepřidělený</option>
          {owners.filter((o) => o.active).map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select name="priority" defaultValue="3">
          <option value="1">Kritické</option>
          <option value="2">Důležité</option>
          <option value="3">Běžné</option>
        </select>
        <input name="dueDate" type="date" defaultValue={today} />
        <button className="primary" type="submit">Přidat</button>
      </form>

      <h2>Otevřené ({open.length})</h2>
      <TaskList tasks={open} owners={owners} showModule />
      <h2>Hotové</h2>
      <TaskList tasks={done} owners={owners} showModule />
    </>
  );
}
