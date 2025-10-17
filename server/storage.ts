import { type Contact, type InsertContact, type CallHistory, type InsertCallHistory } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getAllContacts(): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, contact: InsertContact): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;
  
  getCallHistory(contactId: string): Promise<CallHistory[]>;
  createCallHistory(call: InsertCallHistory): Promise<CallHistory>;
}

export class MemStorage implements IStorage {
  private contacts: Map<string, Contact>;
  private callHistory: Map<string, CallHistory>;

  constructor() {
    this.contacts = new Map();
    this.callHistory = new Map();
  }

  async getAllContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getContact(id: string): Promise<Contact | undefined> {
    return this.contacts.get(id);
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const id = randomUUID();
    const contact: Contact = {
      ...insertContact,
      id,
      createdAt: new Date(),
    };
    this.contacts.set(id, contact);
    return contact;
  }

  async updateContact(id: string, insertContact: InsertContact): Promise<Contact | undefined> {
    const existing = this.contacts.get(id);
    if (!existing) return undefined;

    const updated: Contact = {
      ...existing,
      ...insertContact,
    };
    this.contacts.set(id, updated);
    return updated;
  }

  async deleteContact(id: string): Promise<boolean> {
    const existed = this.contacts.has(id);
    if (existed) {
      this.contacts.delete(id);
      Array.from(this.callHistory.entries())
        .filter(([_, call]) => call.contactId === id)
        .forEach(([callId]) => this.callHistory.delete(callId));
    }
    return existed;
  }

  async getCallHistory(contactId: string): Promise<CallHistory[]> {
    return Array.from(this.callHistory.values())
      .filter((call) => call.contactId === contactId)
      .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime());
  }

  async createCallHistory(insertCall: InsertCallHistory): Promise<CallHistory> {
    const id = randomUUID();
    const call: CallHistory = {
      ...insertCall,
      id,
      calledAt: new Date(),
    };
    this.callHistory.set(id, call);
    return call;
  }
}

export const storage = new MemStorage();
