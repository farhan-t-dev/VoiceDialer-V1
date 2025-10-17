import { 
  contacts, 
  callHistory, 
  tags,
  contactTags,
  campaigns,
  campaignContacts,
  type Contact, 
  type InsertContact, 
  type CallHistory, 
  type InsertCallHistory,
  type Tag,
  type InsertTag,
  type ContactTag,
  type InsertContactTag,
  type Campaign,
  type InsertCampaign,
  type CampaignContact,
  type InsertCampaignContact
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, inArray, and } from "drizzle-orm";

export interface IStorage {
  getAllContacts(): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, contact: InsertContact): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;
  bulkCreateContacts(contacts: InsertContact[]): Promise<Contact[]>;
  
  getAllCallHistory(): Promise<CallHistory[]>;
  getCallHistory(contactId: string): Promise<CallHistory[]>;
  createCallHistory(call: InsertCallHistory): Promise<CallHistory>;

  getAllTags(): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  deleteTag(id: string): Promise<boolean>;
  
  getContactTags(contactId: string): Promise<Tag[]>;
  addTagToContact(contactId: string, tagId: string): Promise<void>;
  removeTagFromContact(contactId: string, tagId: string): Promise<void>;

  getAllCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, campaign: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<boolean>;
  
  getCampaignContacts(campaignId: string): Promise<(CampaignContact & { contact: Contact })[]>;
  addContactsToCampaign(campaignId: string, contactIds: string[]): Promise<void>;
  updateCampaignContactStatus(campaignId: string, contactId: string, status: string, notes?: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getAllContacts(): Promise<Contact[]> {
    return await db.select().from(contacts).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact || undefined;
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const [contact] = await db
      .insert(contacts)
      .values(insertContact)
      .returning();
    return contact;
  }

  async updateContact(id: string, insertContact: InsertContact): Promise<Contact | undefined> {
    const [updated] = await db
      .update(contacts)
      .set(insertContact)
      .where(eq(contacts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteContact(id: string): Promise<boolean> {
    const result = await db.delete(contacts).where(eq(contacts.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getAllCallHistory(): Promise<CallHistory[]> {
    return await db
      .select()
      .from(callHistory)
      .orderBy(desc(callHistory.calledAt));
  }

  async getCallHistory(contactId: string): Promise<CallHistory[]> {
    return await db
      .select()
      .from(callHistory)
      .where(eq(callHistory.contactId, contactId))
      .orderBy(desc(callHistory.calledAt));
  }

  async createCallHistory(insertCall: InsertCallHistory): Promise<CallHistory> {
    const [call] = await db
      .insert(callHistory)
      .values(insertCall)
      .returning();
    return call;
  }

  async bulkCreateContacts(insertContacts: InsertContact[]): Promise<Contact[]> {
    if (insertContacts.length === 0) return [];
    const created = await db
      .insert(contacts)
      .values(insertContacts)
      .returning();
    return created;
  }

  async getAllTags(): Promise<Tag[]> {
    return await db.select().from(tags).orderBy(desc(tags.createdAt));
  }

  async createTag(insertTag: InsertTag): Promise<Tag> {
    const [tag] = await db
      .insert(tags)
      .values(insertTag)
      .returning();
    return tag;
  }

  async deleteTag(id: string): Promise<boolean> {
    const result = await db.delete(tags).where(eq(tags.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getContactTags(contactId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(contactTags)
      .innerJoin(tags, eq(contactTags.tagId, tags.id))
      .where(eq(contactTags.contactId, contactId));
    
    return result.map(r => r.tag);
  }

  async addTagToContact(contactId: string, tagId: string): Promise<void> {
    await db
      .insert(contactTags)
      .values({ contactId, tagId })
      .onConflictDoNothing();
  }

  async removeTagFromContact(contactId: string, tagId: string): Promise<void> {
    await db
      .delete(contactTags)
      .where(
        and(
          eq(contactTags.contactId, contactId),
          eq(contactTags.tagId, tagId)
        )
      );
  }

  async getAllCampaigns(): Promise<Campaign[]> {
    return await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign || undefined;
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db
      .insert(campaigns)
      .values(insertCampaign)
      .returning();
    return campaign;
  }

  async updateCampaign(id: string, updates: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(eq(campaigns.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await db.delete(campaigns).where(eq(campaigns.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getCampaignContacts(campaignId: string): Promise<(CampaignContact & { contact: Contact })[]> {
    const result = await db
      .select({
        campaignContact: campaignContacts,
        contact: contacts,
      })
      .from(campaignContacts)
      .innerJoin(contacts, eq(campaignContacts.contactId, contacts.id))
      .where(eq(campaignContacts.campaignId, campaignId));
    
    return result.map(r => ({
      ...r.campaignContact,
      contact: r.contact,
    }));
  }

  async addContactsToCampaign(campaignId: string, contactIds: string[]): Promise<void> {
    const values = contactIds.map(contactId => ({
      campaignId,
      contactId,
      status: 'pending' as const,
    }));
    
    if (values.length > 0) {
      await db
        .insert(campaignContacts)
        .values(values)
        .onConflictDoNothing();
    }
  }

  async updateCampaignContactStatus(campaignId: string, contactId: string, status: string, notes?: string): Promise<void> {
    await db
      .update(campaignContacts)
      .set({
        status,
        notes,
        calledAt: new Date(),
      })
      .where(
        and(
          eq(campaignContacts.campaignId, campaignId),
          eq(campaignContacts.contactId, contactId)
        )
      );
  }
}

export const storage = new DatabaseStorage();
