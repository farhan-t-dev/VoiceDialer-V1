import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  company: text("company"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const callHistory = pgTable("call_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  calledAt: timestamp("called_at").defaultNow().notNull(),
  notes: text("notes"),
  status: text("status").notNull(), // 'completed', 'missed', 'voicemail', 'busy'
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
}).extend({
  phone: z.string().min(1, "Phone number is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
});

export const insertCallHistorySchema = createInsertSchema(callHistory).omit({
  id: true,
  calledAt: true,
}).extend({
  status: z.enum(['completed', 'missed', 'voicemail', 'busy']),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type CallHistory = typeof callHistory.$inferSelect;
export type InsertCallHistory = z.infer<typeof insertCallHistorySchema>;
