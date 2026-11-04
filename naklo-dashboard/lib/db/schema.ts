import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  real,
  date,
  timestamp,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Typ pracovního vztahu. */
export const relationType = pgEnum("relation_type", ["HPP", "DPP", "DPC", "ICO"]);
export const contractStatus = pgEnum("contract_status", ["draft", "signed", "terminated"]);
export const paymentKind = pgEnum("payment_kind", ["mzda", "faktura", "zaloha", "odvody"]);
export const dataSource = pgEnum("data_source", ["kilomayo", "bank", "manual", "csv", "accountant"]);
export const taskStatus = pgEnum("task_status", ["open", "done"]);
/** Hodnocení člověka: top performer, v pořádku, sledovat, na odchod. */
export const performance = pgEnum("performance", ["top", "ok", "watch", "exit"]);

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ico: text("ico"),
});

export const people = pgTable(
  "people",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    position: text("position"),
    relationType: relationType("relation_type"),
    /** IČO u fakturujících spolupracovníků. */
    ico: text("ico"),
    /** Vazba na člena týmu v KiloMayo. */
    kilomayoMemberId: text("kilomayo_member_id"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    /** Hodinová sazba v Kč (hrubá u zaměstnanců, fakturační u IČO). */
    hourlyRate: integer("hourly_rate"),
    /** Měsíční paušál v Kč (IČO nebo HPP fixní mzda). */
    monthlyFee: integer("monthly_fee"),
    active: boolean("active").notNull().default(true),
    performance: performance("performance"),
    performanceNote: text("performance_note"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("people_kilomayo_member_idx").on(t.kilomayoMemberId)],
);

/** Absolvovaná školení a oprávnění (průkaz vůdce plavidla, první pomoc, BOZP...). */
export const trainings = pgTable("trainings", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  completedAt: date("completed_at"),
  /** null = neomezená platnost */
  validTo: date("valid_to"),
});

/** Která školení vyžaduje která pozice. */
export const trainingRequirements = pgTable("training_requirements", {
  id: serial("id").primaryKey(),
  position: text("position").notNull(),
  name: text("name").notNull(),
});

/** Kolik lidí na jakou pozici potřebujeme v daném období (sezóna). */
export const staffingNeeds = pgTable("staffing_needs", {
  id: serial("id").primaryKey(),
  position: text("position").notNull(),
  needed: integer("needed").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
  module: text("module"),
});

export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  type: relationType("type").notNull(),
  status: contractStatus("status").notNull().default("draft"),
  validFrom: date("valid_from").notNull(),
  /** null = na dobu neurčitou */
  validTo: date("valid_to"),
  hourlyRate: integer("hourly_rate"),
  monthlyFee: integer("monthly_fee"),
  driveUrl: text("drive_url"),
  signedAt: date("signed_at"),
  /** ID smlouvy v KiloMayo (workContracts), když pochází odtud. */
  kilomayoContractId: text("kilomayo_contract_id").unique(),
});

/** Odpracované hodiny za měsíc (typicky z KiloMayo). month = "YYYY-MM". */
export const workMonths = pgTable(
  "work_months",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    hours: real("hours").notNull().default(0),
    shifts: integer("shifts").notNull().default(0),
    source: dataSource("source").notNull().default("manual"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("work_months_person_month_idx").on(t.personId, t.month)],
);

/** Odchozí platby (z banky, ručně nebo z CSV). month = za jaký měsíc se platí. */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  kind: paymentKind("kind").notNull(),
  amount: integer("amount").notNull(),
  paidAt: date("paid_at").notNull(),
  reference: text("reference"),
  source: dataSource("source").notNull().default("manual"),
});

/** Faktury od IČO spolupracovníků. */
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  number: text("number"),
  amount: integer("amount").notNull(),
  receivedAt: date("received_at"),
  dueDate: date("due_date"),
  paidAt: date("paid_at"),
  driveUrl: text("drive_url"),
});

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    detail: text("detail"),
    personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    status: taskStatus("status").notNull().default("open"),
    /** Klíč red flagu, ze kterého úkol vznikl (aby nevznikal dvakrát). */
    flagKey: text("flag_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    /** Modul: hr, events, kemp, wakesurf, bistro, wakeboard, finance, obecne. */
    module: text("module").notNull().default("obecne"),
    /** Komu je úkol přidělený (owners.id). */
    ownerId: integer("owner_id").references(() => owners.id, { onDelete: "set null" }),
    /** 1 = kritické, 2 = varování, 3 = běžné. */
    priority: integer("priority").notNull().default(3),
    /** flag = založil bot z red flagu, manual = ručně. */
    source: text("source").notNull().default("manual"),
    href: text("href"),
    /** Návrh odpovědi nebo postupu, který připravil bot. Nikdy se sám neodesílá. */
    draft: text("draft"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by"),
  },
  (t) => [uniqueIndex("tasks_flag_key_idx").on(t.flagKey)],
);

/** Lidé, kterým bot rozděluje úkoly (vedoucí, provoz). Účetní sem nepatří: bot ji nikdy nekontaktuje. */
export const owners = pgTable("owners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role"),
  /** Moduly, za které odpovídá; "*" = vše, co nikdo jiný nemá. */
  modules: text("modules").array().notNull().default(sql`'{}'::text[]`),
  whatsapp: text("whatsapp"),
  email: text("email"),
  active: boolean("active").notNull().default(true),
});

/** Ranní plán dne od bota. */
export const briefs = pgTable("briefs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  text: text("text").notNull(),
  generatedBy: text("generated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const outboxStatus = pgEnum("outbox_status", ["ke_schvaleni", "schvaleno", "zamitnuto", "odeslano"]);

/** Zprávy, které bot připravil k odeslání. Odejdou až po schválení a jen přes napojený kanál. */
export const outbox = pgTable(
  "outbox",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    text: text("text").notNull(),
    status: outboxStatus("status").notNull().default("ke_schvaleni"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("outbox_owner_date_idx").on(t.ownerId, t.date)],
);

/** Audit: kdo co kdy změnil nebo synchronizoval. */
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  detail: text("detail"),
});

export type Person = typeof people.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type WorkMonth = typeof workMonths.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type Inquiry = typeof inquiries.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Training = typeof trainings.$inferSelect;
export type TrainingRequirement = typeof trainingRequirements.$inferSelect;
export type StaffingNeed = typeof staffingNeeds.$inferSelect;

/* ───────────── Events ───────────── */

export const eventStatus = pgEnum("event_status", ["nova", "jedna_se", "potvrzeno", "storno"]);

/** Akce a pronájmy (pipeline z listu „Pronájmy / Akce“). */
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    /** Odkud řádek pochází, aby šla synchronizace opakovat bez duplicit. */
    sourceKey: text("source_key").notNull(),
    type: text("type"),
    contactName: text("contact_name"),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    people: integer("people"),
    budget: integer("budget"),
    spent: integer("spent"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: eventStatus("status").notNull().default("nova"),
    statusRaw: text("status_raw"),
    source: text("source"),
    space: text("space"),
    accommodation: text("accommodation"),
    boat: boolean("boat").notNull().default(false),
    catering: text("catering"),
    note: text("note"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("events_source_key_idx").on(t.sourceKey)],
);

/** Poptávky z webových formulářů (a později z e-mailů). */
export const inquiries = pgTable(
  "inquiries",
  {
    id: serial("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    message: text("message"),
    channel: text("channel"),
    answered: boolean("answered").notNull().default(false),
  },
  (t) => [uniqueIndex("inquiries_source_key_idx").on(t.sourceKey)],
);

/** Obchodní leady na partnerské akce (list „Leady“). */
export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    type: text("type"),
    category: text("category"),
    company: text("company").notNull(),
    stage: text("stage"),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    location: text("location"),
    priority: text("priority"),
    why: text("why"),
    web: text("web"),
  },
  (t) => [uniqueIndex("leads_source_key_idx").on(t.sourceKey)],
);

/* ───────────── Provozní střediska (Kemp, Wakesurf, Bistro, Wakeboard) ───────────── */

export const txKind = pgEnum("tx_kind", ["prijem", "naklad"]);
export const payMethod = pgEnum("pay_method", ["hotove", "karta", "prevod", "online"]);

/** Příjem nebo náklad střediska. unit = "kemp" | "wakesurf" | "bistro" | "wakeboard". */
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  unit: text("unit").notNull(),
  date: date("date").notNull(),
  kind: txKind("kind").notNull(),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
  method: payMethod("method").notNull(),
  source: text("source").notNull().default("manual"),
  /** Pro opakovaný import bez duplicit (např. id dokladu z KiloMayo). */
  externalId: text("external_id"),
  note: text("note"),
}, (t) => [uniqueIndex("transactions_external_idx").on(t.externalId)]);

/** Přepočet hotovosti v pokladně střediska. */
export const cashCounts = pgTable("cash_counts", {
  id: serial("id").primaryKey(),
  unit: text("unit").notNull(),
  date: date("date").notNull(),
  amount: integer("amount").notNull(),
  countedBy: text("counted_by"),
  note: text("note"),
});

export type Transaction = typeof transactions.$inferSelect;
export type CashCount = typeof cashCounts.$inferSelect;

/* ───────────── PR ───────────── */

export const prKind = pgEnum("pr_kind", ["recenze", "zprava", "komentar", "zminka", "prispevek"]);
export const prStatus = pgEnum("pr_status", ["nove", "vyrizeno", "planovano", "publikovano"]);

/**
 * Jedna položka PR: recenze (Google, Mapy.cz…), zpráva nebo komentář ze sítí,
 * zmínka v médiích, nebo plánovaný či publikovaný příspěvek.
 */
export const prItems = pgTable(
  "pr_items",
  {
    id: serial("id").primaryKey(),
    kind: prKind("kind").notNull(),
    channel: text("channel").notNull(),
    externalId: text("external_id"),
    at: timestamp("at", { withTimezone: true }).notNull(),
    author: text("author"),
    title: text("title"),
    text: text("text"),
    /** Hodnocení 1–5 u recenzí. */
    rating: integer("rating"),
    url: text("url"),
    status: prStatus("status").notNull().default("nove"),
    /** Vazba příspěvku na akci. */
    eventId: integer("event_id").references(() => events.id, { onDelete: "set null" }),
    /** Dosah nebo počet reakcí u příspěvků a zmínek. */
    reach: integer("reach"),
  },
  (t) => [uniqueIndex("pr_items_external_idx").on(t.externalId)],
);

export type PrItem = typeof prItems.$inferSelect;
export type Owner = typeof owners.$inferSelect;
export type Brief = typeof briefs.$inferSelect;
export type OutboxMsg = typeof outbox.$inferSelect;
