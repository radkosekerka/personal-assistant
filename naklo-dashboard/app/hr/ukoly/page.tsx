import { dashboardData } from "@/lib/data";
import { TaskList } from "@/components/ui";
import { createTask } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const { tasks, snapshot } = await dashboardData();
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done").slice(0, 20);
  return (
    <>
      <h1>Úkoly</h1>
      <form action={createTask} className="stack">
        <input name="title" placeholder="Nový úkol" required />
        <select name="personId" defaultValue="">
          <option value="">Bez osoby</option>
          {snapshot.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>
        <input name="dueDate" type="date" />
        <div>
          <button className="primary" type="submit">Přidat úkol</button>
        </div>
      </form>
      <h2>Otevřené ({open.length})</h2>
      <TaskList tasks={open} people={snapshot.people} />
      <h2>Hotové</h2>
      <TaskList tasks={done} people={snapshot.people} />
    </>
  );
}
