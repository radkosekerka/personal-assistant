export interface ModuleDef {
  key: string;
  name: string;
  href: string;
  live: boolean;
  /** Co modul ukáže a odkud bere data (u připravovaných modulů plán). */
  summary: string;
  sources: string[];
}

export const MODULES: ModuleDef[] = [
  {
    key: "hr",
    name: "HR",
    href: "/hr",
    live: true,
    summary: "Lidé, smlouvy, hodiny, výplaty, školení, kdo chybí a kdo je top.",
    sources: ["KiloMayo (směny a hodiny)", "Smlouvy na Drive", "Banka", "Rekapitulace mezd od účetní"],
  },
  {
    key: "events",
    name: "Events & PR",
    href: "/events",
    live: true,
    summary: "Poptávky, akce, kalendář, leady. PR: recenze, zprávy a komentáře ze sítí, média, příspěvky.",
    sources: ["Tabulka Event Form 2026", "E-maily", "Facebook a Instagram", "Google a Mapy.cz recenze"],
  },
  {
    key: "finance",
    name: "Finance",
    href: "/finance",
    live: true,
    summary: "Zůstatky a pohyby na účtech KB všech firem skupiny, cashflow, nízké zůstatky, velké platby.",
    sources: ["KB API (zůstatky a pohyby)", "Účetnictví (export od účetní)", "Stripe", "KiloMayo Finances"],
  },
  {
    key: "kemp",
    name: "Kemp",
    href: "/kemp",
    live: true,
    summary: "Příjmy, náklady a výsledek kempu, stav pokladny.",
    sources: ["Trevlix a Booking.com (ubytování)", "KiloMayo (pokladna)", "Banka (náklady)"],
  },
  {
    key: "wakesurf",
    name: "Wakesurf",
    href: "/wakesurf",
    live: true,
    summary: "Příjmy, náklady a výsledek wakesurfu, stav pokladny.",
    sources: ["Rezervace na webu a Stripe", "KiloMayo (pokladna)", "Banka (náklady)"],
  },
  {
    key: "bistro",
    name: "Bistro",
    href: "/bistro",
    live: true,
    summary: "Příjmy, náklady a výsledek bistra, stav pokladny.",
    sources: ["KiloMayo (objednávky a tržby)", "Faktury dodavatelů", "Banka"],
  },
  {
    key: "wakeboard",
    name: "Wakeboard",
    href: "/wakeboard",
    live: true,
    summary: "Příjmy, náklady a výsledek vleku, stav pokladny.",
    sources: ["Rezervace na webu a Stripe", "KiloMayo (pokladna)", "Banka (náklady)"],
  },
];
