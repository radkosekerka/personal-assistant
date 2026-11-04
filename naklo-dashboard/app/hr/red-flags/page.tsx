import { dashboardData } from "@/lib/data";
import { FlagList } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FlagsPage() {
  const { flags, tasks } = await dashboardData();
  const critical = flags.filter((f) => f.severity === "critical");
  const warning = flags.filter((f) => f.severity === "warning");
  return (
    <>
      <h1>Red flags</h1>
      <p className="muted">
        Kontroly běží při každém otevření stránky nad aktuálními daty. Z každého flagu jde jedním kliknutím udělat úkol.
      </p>
      <h2>Kritické ({critical.length})</h2>
      <FlagList flags={critical} tasks={tasks} />
      <h2>Varování ({warning.length})</h2>
      <FlagList flags={warning} tasks={tasks} />
    </>
  );
}
