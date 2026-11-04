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
  },
  (t) => [uniqueIndex("tasks_flag_key_idx").on(t.flagKey)],
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
