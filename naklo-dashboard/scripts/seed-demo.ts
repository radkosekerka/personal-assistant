/**
 * Demo data s vymyšlenými lidmi, jen pro lokální vývoj a ukázku dashboardu.
 * Skutečná data se sem nikdy nepíšou (repo nesmí obsahovat osobní údaje).
 */
import { eq, sql } from "drizzle-orm";
import { getDb, closeDb, schema } from "../lib/db";
import { addMonths, monthOf, todayIso, dayOfMonth } from "../lib/dates";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo data nepatří do produkce");
  const db = getDb();
  await db.execute(
    sql`TRUNCATE pr_items, transactions, cash_counts, audit_log, tasks, invoices, payments, work_months, contracts, trainings, training_requirements, staffing_needs, events, inquiries, leads, people, companies RESTART IDENTITY CASCADE`,
  );

  const today = todayIso();
  const m0 = monthOf(today);
  const m1 = addMonths(m0, -1);
  const m2 = addMonths(m0, -2);
  const m3 = addMonths(m0, -3);

  const [wsn] = await db.insert(schema.companies).values({ name: "Wake Surf Náklo (demo)", ico: "00000000" }).returning();

  const P = async (v: typeof schema.people.$inferInsert) =>
    (await db.insert(schema.people).values({ companyId: wsn.id, ...v }).returning())[0];

  const anna = await P({ fullName: "Anna Demo", position: "Kapitánka lodi", relationType: "HPP", monthlyFee: 32000, startDate: "2025-04-01" });
  const petr = await P({ fullName: "Petr Ukázka", position: "Obsluha vleku", relationType: "DPP", hourlyRate: 190, startDate: "2026-05-01" });
  const eva = await P({ fullName: "Eva Příkladová", position: "Bar", relationType: "DPP", hourlyRate: 180, startDate: "2026-04-15" });
  const jan = await P({ fullName: "Jan Testovací", position: "Instruktor", relationType: "ICO", ico: "12345678", hourlyRate: 350, startDate: "2026-05-01" });
  const marek = await P({ fullName: "Marek Vzorový", position: "Provozní", relationType: "ICO", ico: "87654321", monthlyFee: 45000, startDate: "2025-03-01" });
  const lucie = await P({ fullName: "Lucie Nová", position: "Recepce", relationType: "DPC", hourlyRate: 200, startDate: "2026-09-01" });
  await P({ fullName: "Tomáš Neznámý", position: "Brigáda", relationType: null, hourlyRate: 170 });

  await db.insert(schema.contracts).values([
    { personId: anna.id, type: "HPP", status: "signed", validFrom: "2025-04-01", monthlyFee: 32000 },
    { personId: petr.id, type: "DPP", status: "signed", validFrom: "2026-05-01", validTo: "2026-12-31", hourlyRate: 190 },
    // Eva pracuje, ale smlouva je jen návrh
    { personId: eva.id, type: "DPP", status: "draft", validFrom: "2026-04-15", hourlyRate: 180 },
    { personId: jan.id, type: "ICO", status: "signed", validFrom: "2026-05-01", validTo: dayOfMonth(m0, 25), hourlyRate: 350 },
    { personId: marek.id, type: "ICO", status: "signed", validFrom: "2025-03-01", monthlyFee: 45000 },
    { personId: lucie.id, type: "DPC", status: "signed", validFrom: "2026-09-01", hourlyRate: 200 },
  ]);

  await db.insert(schema.workMonths).values([
    { personId: anna.id, month: m1, hours: 168, shifts: 21, source: "kilomayo" },
    { personId: anna.id, month: m2, hours: 176, shifts: 22, source: "kilomayo" },
    { personId: petr.id, month: m3, hours: 96, shifts: 12, source: "kilomayo" },
    { personId: petr.id, month: m2, hours: 104, shifts: 13, source: "kilomayo" },
    { personId: petr.id, month: m1, hours: 80, shifts: 10, source: "kilomayo" },
    { personId: eva.id, month: m2, hours: 42, shifts: 6, source: "kilomayo" },
    { personId: eva.id, month: m1, hours: 36, shifts: 5, source: "kilomayo" },
    { personId: jan.id, month: m2, hours: 60, shifts: 10, source: "kilomayo" },
    { personId: jan.id, month: m1, hours: 44, shifts: 8, source: "kilomayo" },
    { personId: lucie.id, month: m1, hours: 104, shifts: 13, source: "kilomayo" },
  ]);

  const paid = dayOfMonth(m0, 10);
  await db.insert(schema.payments).values([
    ...[5, 4, 3].map((k) => ({ personId: anna.id, month: addMonths(m0, -k), kind: "mzda" as const, amount: 25100, paidAt: dayOfMonth(addMonths(m0, 1 - k), 12), source: "bank" as const })),
    { personId: petr.id, month: m3, kind: "mzda", amount: 18240, paidAt: dayOfMonth(m2, 12), source: "bank" },
    { personId: anna.id, month: m2, kind: "mzda", amount: 25100, paidAt: dayOfMonth(m1, 12), source: "bank" },
    { personId: anna.id, month: m1, kind: "mzda", amount: 25100, paidAt: paid, source: "bank" },
    { personId: petr.id, month: m2, kind: "mzda", amount: 19760, paidAt: dayOfMonth(m1, 12), source: "bank" },
    { personId: petr.id, month: m1, kind: "mzda", amount: 15200, paidAt: paid, source: "bank" },
    { personId: eva.id, month: m2, kind: "mzda", amount: 7560, paidAt: dayOfMonth(m1, 12), source: "bank" },
    { personId: jan.id, month: m2, kind: "faktura", amount: 21000, paidAt: dayOfMonth(m1, 14), source: "bank" },
    { personId: marek.id, month: m2, kind: "faktura", amount: 45000, paidAt: dayOfMonth(m1, 5), source: "bank" },
    { personId: marek.id, month: m2, kind: "faktura", amount: 45000, paidAt: dayOfMonth(m1, 6), source: "bank" },
  ]);

  await db.insert(schema.invoices).values([
    { personId: jan.id, month: m2, number: "2026-014", amount: 21000, dueDate: dayOfMonth(m1, 14), paidAt: dayOfMonth(m1, 14) },
    { personId: jan.id, month: m1, number: "2026-015", amount: 17500, dueDate: dayOfMonth(m0, 2) },
    { personId: marek.id, month: m2, number: "MV-09", amount: 45000, dueDate: dayOfMonth(m1, 10), paidAt: dayOfMonth(m1, 5) },
  ]);

  // Tým: hodnocení, školení, potřeba lidí na sezónu
  await db.update(schema.people).set({ performance: "top", performanceNote: "Spolehlivá, zaučuje nové" }).where(eq(schema.people.id, anna.id));
  await db.update(schema.people).set({ performance: "watch", performanceNote: "2× pozdní příchod v říjnu" }).where(eq(schema.people.id, eva.id));
  await db.update(schema.people).set({ performance: "top" }).where(eq(schema.people.id, jan.id));
  await db.insert(schema.trainingRequirements).values([
    { position: "Kapitánka lodi", name: "Průkaz vůdce plavidla" },
    { position: "Kapitánka lodi", name: "První pomoc" },
    { position: "Obsluha vleku", name: "Obsluha vleku – zaškolení" },
    { position: "Instruktor", name: "První pomoc" },
  ]);
  await db.insert(schema.trainings).values([
    { personId: anna.id, name: "Průkaz vůdce plavidla", completedAt: "2024-04-10" },
    { personId: anna.id, name: "První pomoc", completedAt: "2024-11-20", validTo: dayOfMonth(m0, 28) },
    { personId: jan.id, name: "První pomoc", completedAt: "2025-05-01", validTo: "2027-05-01" },
  ]);
  const y = Number(m0.slice(0, 4)) + 1;
  await db.insert(schema.staffingNeeds).values([
    { position: "Obsluha vleku", needed: 3, validFrom: `${y}-01-01`, validTo: `${y}-09-30`, module: "wakeboard" },
    { position: "Kapitánka lodi", needed: 2, validFrom: dayOfMonth(m0, 1), validTo: `${y}-09-30`, module: "wakesurf" },
  ]);

  // Events
  await db.insert(schema.events).values([
    { sourceKey: "demo:1", type: "Firemní teambuilding", contactName: "Jana Ukázková", company: "Demo Strojírny s.r.o.", email: "jana@demo.cz", people: 40, budget: 85000, startDate: `${y}-06-12`, status: "potvrzeno", space: "Worklounge", boat: true, catering: "raut" },
    { sourceKey: "demo:2", type: "Svatba", contactName: "Petra Vzorová", email: "petra@demo.cz", people: 80, startDate: `${y}-08-21`, endDate: `${y}-08-23`, status: "jedna_se", space: "Terasa", accommodation: "Glamping" },
    { sourceKey: "demo:3", type: "Rozlučka se svobodou", contactName: "Tomáš Demo", email: "tomas@demo.cz", startDate: dayOfMonth(m0, 22), status: "potvrzeno", space: "Worklounge" },
    { sourceKey: "demo:4", type: "Narozeniny", contactName: "Klára Demo", email: "klara@demo.cz", people: 20, startDate: dayOfMonth(m1, 5), status: "jedna_se" },
    { sourceKey: "demo:5", type: "Firemní den", contactName: "Ondřej Demo", company: "Demo IT a.s.", email: "ondrej@demo.cz", people: 120, budget: 150000, status: "nova" },
    { sourceKey: "demo:6", type: "Svatba", contactName: "Lenka Demo", email: "lenka@demo.cz", startDate: `${y}-07-04`, status: "storno" },
  ]);
  const evs = await db.select().from(schema.events);
  const evId = (key: string) => evs.find((e) => e.sourceKey === key)!.id;
  const at = (d: string, h = "10:00") => new Date(`${d}T${h}:00+01:00`);
  await db.insert(schema.prItems).values([
    { kind: "recenze", channel: "Google", at: at(dayOfMonth(m0, 2)), author: "Lucie D.", rating: 2, text: "Dlouho jsme čekali na loď, obsluha nepříjemná.", status: "nove" },
    { kind: "recenze", channel: "Google", at: at(dayOfMonth(m1, 28)), author: "Petr K.", rating: 5, text: "Skvělý wakesurf, určitě znovu!", status: "nove" },
    { kind: "recenze", channel: "Mapy.cz", at: at(dayOfMonth(m1, 15)), author: "anonym", rating: 4, text: "Pěkný kemp, čisté sprchy.", status: "vyrizeno" },
    { kind: "recenze", channel: "Google", at: at(dayOfMonth(m2, 10)), author: "Martina S.", rating: 5, text: "Nejlepší teambuilding.", status: "vyrizeno" },
    { kind: "recenze", channel: "Booking.com", at: at(dayOfMonth(m2, 3)), author: "Host", rating: 4, text: "Glamping super, snídaně slabší.", status: "vyrizeno" },
    { kind: "zprava", channel: "Instagram", at: at(dayOfMonth(m0, 1), "21:10"), author: "@demo_surfer", text: "Máte otevřeno i v listopadu?", status: "nove" },
    { kind: "komentar", channel: "Facebook", at: at(dayOfMonth(m0, 3), "18:00"), author: "Jana Demo", text: "Kolik stojí permanentka na příští rok?", status: "nove" },
    { kind: "zminka", channel: "Olomoucký deník (demo)", at: at(dayOfMonth(m2, 12)), title: "Wakesurf u Olomouce láká i zahraniční jezdce", url: "https://example.com/clanek", reach: 45000, status: "vyrizeno" },
    { kind: "prispevek", channel: "Instagram", at: at(dayOfMonth(m0, 15)), title: "Rozlučka sezóny – pozvánka", eventId: evId("demo:3"), status: "planovano" },
    { kind: "prispevek", channel: "Facebook", at: at(dayOfMonth(m1, 2)), title: "Fotky z King of Surf", reach: 12800, status: "publikovano" },
  ]);

  await db.insert(schema.inquiries).values([
    { sourceKey: "demo:q1", receivedAt: new Date(`${dayOfMonth(m0, 1)}T09:12:00+01:00`), name: "Martin Demo", email: "martin@demo.cz", message: "Firemní akce pro 60 lidí v červnu, prosím o nabídku.", channel: "New-web" },
    { sourceKey: "demo:q2", receivedAt: new Date(`${dayOfMonth(m1, 20)}T18:40:00+01:00`), name: "Alena Demo", email: "alena@demo.cz", message: "Oslava 50. narozenin, 30 lidí, ubytování?", channel: "New-web" },
    { sourceKey: "demo:q3", receivedAt: new Date(`${dayOfMonth(m1, 10)}T10:00:00+01:00`), name: "Jana Ukázková", email: "jana@demo.cz", message: "Teambuilding", channel: "Solidpixels", answered: true },
  ]);
  await db.insert(schema.leads).values([
    { sourceKey: "demo:l1", type: "Sportovní událost", category: "SUP workshop", company: "Demo SUP Olomouc", stage: "TODO", location: "Olomouc", priority: "Vysoká", why: "Lokální SUP partner" },
    { sourceKey: "demo:l2", type: "Hudební event", category: "DJ večer", company: "Demo Sound Brno", stage: "Osloveno", location: "Brno", priority: "Střední", why: "Letní open air" },
  ]);

  // Provozní střediska: deterministická pseudonáhoda, ať jsou demo čísla stabilní
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const UNITS = {
    kemp: { inc: [["Ubytování", 180000], ["Poplatky z pobytu", 9000]], cost: [["Energie", 22000], ["Úklid", 18000], ["Provize Booking", 14000]] },
    wakesurf: { inc: [["Jízdy", 260000], ["Permanentky", 60000]], cost: [["Palivo", 38000], ["Servis lodi", 25000], ["Mzdy kapitánů", 70000]] },
    bistro: { inc: [["Tržba bar", 210000], ["Tržba kuchyně", 140000]], cost: [["Zboží", 150000], ["Mzdy", 90000], ["Energie", 12000]] },
    wakeboard: { inc: [["Jízdy", 120000], ["Půjčovné", 18000]], cost: [["Energie vlek", 30000], ["Servis vleku", 45000], ["Mzdy", 60000]] },
  } as const;
  const rows: (typeof schema.transactions.$inferInsert)[] = [];
  for (const [unit, def] of Object.entries(UNITS)) {
    for (let k = 5; k >= 0; k--) {
      const mm = addMonths(m0, -k);
      const season = [0.15, 0.35, 0.7, 1, 0.9, 0.5][(Number(mm.slice(5)) + 6) % 6] ?? 0.5;
      const days = k === 0 ? Number(today.slice(8)) : 28;
      for (const [category, base] of def.inc) {
        for (let d = 1; d <= days; d += 7) {
          const amt = Math.round((base / 4) * season * (0.7 + rnd() * 0.6));
          rows.push({ unit, date: dayOfMonth(mm, d), kind: "prijem", category, amount: amt, method: "karta", source: "demo" });
          rows.push({ unit, date: dayOfMonth(mm, d + 1), kind: "prijem", category, amount: Math.round(amt * 0.25), method: "hotove", source: "demo" });
        }
      }
      if (k === 0 && days < 20) continue;
      for (const [category, base] of def.cost) {
        rows.push({ unit, date: dayOfMonth(mm, 20), kind: "naklad", category, amount: Math.round(base * (0.6 + season * 0.5) * (0.8 + rnd() * 0.4)), method: "prevod", source: "demo" });
      }
    }
  }
  // Wakeboard: ztrátový minulý měsíc (velká oprava vleku)
  rows.push({ unit: "wakeboard", date: dayOfMonth(m1, 25), kind: "naklad", category: "Servis vleku", amount: 180000, method: "prevod", source: "demo", note: "Výměna lana a kladek" });
  // Hotovostní výdaje z pokladny
  rows.push({ unit: "bistro", date: dayOfMonth(m0, 2), kind: "naklad", category: "Zboží", amount: 3200, method: "hotove", source: "demo", note: "Makro" });
  await db.insert(schema.transactions).values(rows);

  // Přepočty pokladen: bistro má při posledním přepočtu manko 1 450 Kč
  const cashTx = await db.select().from(schema.transactions);
  const cashUntil = (unit: string, from: string, to: string) =>
    cashTx
      .filter((t) => t.unit === unit && t.method === "hotove" && t.date > from && t.date <= to)
      .reduce((s, t) => s + (t.kind === "prijem" ? t.amount : -t.amount), 0);
  const c1 = dayOfMonth(m1, 28);
  const c2 = dayOfMonth(m0, 3);
  for (const unit of ["kemp", "wakesurf", "bistro", "wakeboard"]) {
    await db.insert(schema.cashCounts).values({ unit, date: c1, amount: 5000, countedBy: "demo" });
    if (unit === "kemp") continue; // kemp dlouho nepřepočítaný
    const exp = 5000 + cashUntil(unit, c1, c2);
    await db.insert(schema.cashCounts).values({ unit, date: c2, amount: unit === "bistro" ? exp - 1450 : exp, countedBy: "demo" });
  }

  await db.insert(schema.tasks).values([
    { title: "Poslat účetní podklady ke mzdám", dueDate: dayOfMonth(m0, 3) },
    { title: "Dohodnout novou smlouvu na sezónu 2027", personId: marek.id },
  ]);

  console.log("Demo data nahraná.");
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
