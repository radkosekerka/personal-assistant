import { describe, expect, it } from "vitest";
import type { Owner, Task } from "../db/schema";
import { buildDay, ownerFor, ownerMessage, planTasks, ruleBrief, type BotFlag } from "./plan";

const owner = (id: number, name: string, modules: string[], o: Partial<Owner> = {}): Owner => ({
  id,
  name,
  role: null,
  modules,
  whatsapp: null,
  email: null,
  active: true,
  ...o,
});
let seq = 1;
const task = (o: Partial<Task>): Task => ({
  id: seq++,
  title: "Úkol",
  detail: null,
  personId: null,
  dueDate: null,
  status: "open",
  flagKey: null,
  createdAt: new Date(),
  module: "obecne",
  ownerId: null,
  priority: 3,
  source: "manual",
  href: null,
  draft: null,
  closedAt: null,
  closedBy: null,
  ...o,
});
const flag = (key: string, module: BotFlag["module"], severity: BotFlag["severity"] = "warning"): BotFlag => ({
  key,
  module,
  severity,
  title: key,
  href: "/",
});

const owners = [owner(1, "Radko Sekerka", ["*"]), owner(2, "Eva Demo", ["events", "bistro"]), owner(3, "Neaktivní", ["hr"], { active: false })];

describe("centrální bot", () => {
  it("přiřadí vlastníka modulu, jinak toho s *", () => {
    expect(ownerFor("events", owners)?.id).toBe(2);
    expect(ownerFor("hr", owners)?.id).toBe(1); // neaktivní se přeskočí
  });

  it("založí úkoly jen pro nové flagy a uzavře vyřešené", () => {
    const tasks = [
      task({ id: 100, flagKey: "A", source: "flag" }),
      task({ id: 101, flagKey: "GONE", source: "flag" }),
      task({ id: 102, flagKey: "MANUAL", source: "manual" }),
    ];
    const plan = planTasks([flag("A", "hr"), flag("B", "events", "critical")], tasks, owners, "2026-11-04");
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({ flagKey: "B", ownerId: 2, priority: 1, dueDate: "2026-11-04" });
    expect(plan.close).toEqual([101]);
  });

  it("varování dostane termín za 2 dny", () => {
    const plan = planTasks([flag("W", "kemp")], [], owners, "2026-11-04");
    expect(plan.create[0].dueDate).toBe("2026-11-06");
  });

  it("plán dne řadí kritické a po termínu nahoru a dělí podle lidí", () => {
    const open = [
      task({ id: 1, title: "běžné", priority: 3, ownerId: 1 }),
      task({ id: 2, title: "po termínu", priority: 2, dueDate: "2026-11-01", ownerId: 2 }),
      task({ id: 3, title: "varování", priority: 2, dueDate: "2026-11-06", ownerId: 2 }),
      task({ id: 4, title: "kritické", priority: 1, dueDate: "2026-11-04", ownerId: 1 }),
      task({ id: 5, title: "hotové", status: "done" }),
    ];
    const day = buildDay(open, owners, "2026-11-04", { closedToday: 1, createdToday: 2 });
    expect(day.top.map((t) => t.title)).toEqual(["kritické", "po termínu", "varování", "běžné"]);
    expect(day.byOwner[0].owner?.id).toBe(1);
    expect(day.byOwner.find((o) => o.owner?.id === 2)?.overdue).toBe(1);
    expect(ruleBrief(day)).toContain("1. [Obecné] kritické (dnes)");
    expect(ownerMessage(day.byOwner[1], "2026-11-04", "https://x")).toMatch(/^Ahoj Eva/);
  });
});
