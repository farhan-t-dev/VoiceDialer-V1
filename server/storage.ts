import { contacts, callHistory, type Contact, type InsertContact, type CallHistory, type InsertCallHistory } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getAllContacts(): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, contact: InsertContact): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;
  
  getCallHistory(contactId: string): Promise<CallHistory[]>;
  createCallHistory(call: InsertCallHistory): Promise<CallHistory>;
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
}

export const storage = new DatabaseStorage();
