import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, primaryKey } from "drizzle-orm/pg-core";
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

export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contactTags = pgTable("contact_tags", {
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.contactId, table.tagId] }),
}));

export const aiAgents = pgTable("ai_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  personality: text("personality").notNull(), // AI personality description
  voiceId: text("voice_id"), // ElevenLabs voice ID
  conversationScript: text("conversation_script").notNull(), // Script/prompt for the AI
  greeting: text("greeting"), // Opening greeting
  objectionHandling: text("objection_handling"), // How to handle objections
  closingScript: text("closing_script"), // Closing statement
  isActive: text("is_active").notNull().default('true'), // 'true' or 'false'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  agentId: varchar("agent_id").references(() => aiAgents.id, { onDelete: "set null" }), // AI agent for this campaign
  status: text("status").notNull().default('draft'), // 'draft', 'active', 'completed', 'paused'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const campaignContacts = pgTable("campaign_contacts", {
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  status: text("status").notNull().default('pending'), // 'pending', 'calling', 'completed', 'failed'
  calledAt: timestamp("called_at"),
  notes: text("notes"),
}, (table) => ({
  pk: primaryKey({ columns: [table.campaignId, table.contactId] }),
}));

export const callRecordings = pgTable("call_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callHistoryId: varchar("call_history_id").notNull().references(() => callHistory.id, { onDelete: "cascade" }),
  recordingUrl: text("recording_url"), // URL to audio recording
  duration: text("duration"), // Call duration
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversationTranscripts = pgTable("conversation_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callHistoryId: varchar("call_history_id").notNull().references(() => callHistory.id, { onDelete: "cascade" }),
  speaker: text("speaker").notNull(), // 'agent' or 'contact'
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
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

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Tag name is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color"),
});

export const insertContactTagSchema = createInsertSchema(contactTags);

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Campaign name is required"),
  status: z.enum(['draft', 'active', 'completed', 'paused']).default('draft'),
});

export const insertCampaignContactSchema = createInsertSchema(campaignContacts).omit({
  calledAt: true,
}).extend({
  status: z.enum(['pending', 'calling', 'completed', 'failed']).default('pending'),
});

export const insertAiAgentSchema = createInsertSchema(aiAgents).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Agent name is required"),
  personality: z.string().min(1, "Personality description is required"),
  conversationScript: z.string().min(1, "Conversation script is required"),
  isActive: z.enum(['true', 'false']).default('true'),
});

export const insertCallRecordingSchema = createInsertSchema(callRecordings).omit({
  id: true,
  createdAt: true,
});

export const insertConversationTranscriptSchema = createInsertSchema(conversationTranscripts).omit({
  id: true,
  timestamp: true,
}).extend({
  speaker: z.enum(['agent', 'contact']),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type CallHistory = typeof callHistory.$inferSelect;
export type InsertCallHistory = z.infer<typeof insertCallHistorySchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type ContactTag = typeof contactTags.$inferSelect;
export type InsertContactTag = z.infer<typeof insertContactTagSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type CampaignContact = typeof campaignContacts.$inferSelect;
export type InsertCampaignContact = z.infer<typeof insertCampaignContactSchema>;
export type AiAgent = typeof aiAgents.$inferSelect;
export type InsertAiAgent = z.infer<typeof insertAiAgentSchema>;
export type CallRecording = typeof callRecordings.$inferSelect;
export type InsertCallRecording = z.infer<typeof insertCallRecordingSchema>;
export type ConversationTranscript = typeof conversationTranscripts.$inferSelect;
export type InsertConversationTranscript = z.infer<typeof insertConversationTranscriptSchema>;
