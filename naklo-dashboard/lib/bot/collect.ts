import { dashboardData } from "../data";
import { eventsData } from "../events/data";
import { allUnitsData } from "../units/data";
import { bankData } from "../bank/data";
import { UNITS } from "../units";
import type { BotFlag } from "./plan";
import { monthLabel } from "../dates";

/** Posbírá red flags ze všech modulů do jednoho seznamu. */
export async function collectFlags(): Promise<BotFlag[]> {
  const [hr, ev, units, bank] = await Promise.all([dashboardData(), eventsData(), allUnitsData(), bankData()]);
  return [
    ...hr.flags.map((f) => ({
      key: f.key,
      module: "hr" as const,
      severity: f.severity === "critical" ? ("critical" as const) : ("warning" as const),
      title: f.month && !f.title.includes(f.month) ? `${f.title} (${monthLabel(f.month)})` : f.title,
      detail: f.detail,
      href: f.personId ? `/hr/lide/${f.personId}` : "/hr",
    })),
    ...bank.flags.map((f) => ({ key: f.key, module: "finance" as const, severity: f.severity, title: f.title, detail: f.detail, href: f.href })),
    ...ev.flags.map((f) => ({ key: f.key, module: "events" as const, severity: f.severity, title: f.title, detail: f.detail, href: f.href })),
    ...UNITS.flatMap((u) =>
      units[u].flags.map((f) => ({ key: f.key, module: u, severity: f.severity, title: f.title, detail: f.detail, href: `/${u}` })),
    ),
  ];
}
