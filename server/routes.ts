import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertContactSchema, insertCallHistorySchema, insertTagSchema } from "@shared/schema";
import { automatedDial } from "./google-voice-automation";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/contacts", async (_req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const validated = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(validated);
      res.status(201).json(contact);
    } catch (error) {
      res.status(400).json({ error: "Invalid contact data" });
    }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const validated = insertContactSchema.parse(req.body);
      const contact = await storage.updateContact(req.params.id, validated);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(400).json({ error: "Invalid contact data" });
    }
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteContact(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  app.get("/api/calls", async (req, res) => {
    try {
      const calls = await storage.getAllCallHistory();
      res.json(calls);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch call history" });
    }
  });

  app.get("/api/contacts/:id/calls", async (req, res) => {
    try {
      const calls = await storage.getCallHistory(req.params.id);
      res.json(calls);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch call history" });
    }
  });

  app.post("/api/calls", async (req, res) => {
    try {
      const validated = insertCallHistorySchema.parse(req.body);
      const call = await storage.createCallHistory(validated);
      res.status(201).json(call);
    } catch (error) {
      res.status(400).json({ error: "Invalid call data" });
    }
  });

  app.post("/api/dial/automated", async (req, res) => {
    try {
      const { contactId, phoneNumber } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      console.log(`Initiating automated dial for ${phoneNumber}`);
      
      // Perform the automated dial
      const success = await automatedDial(phoneNumber);
      
      if (success && contactId) {
        // Automatically log the call as completed
        const call = await storage.createCallHistory({
          contactId,
          status: 'completed',
          notes: 'Automated dial initiated',
        });
        
        return res.json({ 
          success: true, 
          message: 'Call initiated successfully',
          call 
        });
      }

      res.json({ 
        success: true, 
        message: 'Call initiated successfully' 
      });
    } catch (error) {
      console.error('Automated dial failed:', error);
      res.status(500).json({ 
        error: 'Failed to initiate automated dial',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/contacts/bulk", async (req, res) => {
    try {
      const { contacts: contactsData } = req.body;
      if (!Array.isArray(contactsData)) {
        return res.status(400).json({ error: "Expected an array of contacts" });
      }

      const results = {
        successful: [] as any[],
        failed: [] as any[],
      };

      for (const contactData of contactsData) {
        const lineNumber = contactData._csvLineNumber;
        const { _csvLineNumber, ...dataWithoutLineNumber } = contactData;
        
        try {
          const validated = insertContactSchema.parse(dataWithoutLineNumber);
          results.successful.push(validated);
        } catch (error) {
          let errorMessage = "Validation failed";
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          
          results.failed.push({
            lineNumber,
            data: dataWithoutLineNumber,
            error: errorMessage,
          });
        }
      }

      const created = results.successful.length > 0 
        ? await storage.bulkCreateContacts(results.successful)
        : [];

      res.status(201).json({
        imported: created.length,
        failed: results.failed.length,
        contacts: created,
        errors: results.failed,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to import contacts" });
    }
  });

  app.get("/api/tags", async (_req, res) => {
    try {
      const allTags = await storage.getAllTags();
      res.json(allTags);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  app.post("/api/tags", async (req, res) => {
    try {
      const validated = insertTagSchema.parse(req.body);
      const tag = await storage.createTag(validated);
      res.status(201).json(tag);
    } catch (error) {
      res.status(400).json({ error: "Invalid tag data" });
    }
  });

  app.delete("/api/tags/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTag(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Tag not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  app.get("/api/contacts/:id/tags", async (req, res) => {
    try {
      const contactTags = await storage.getContactTags(req.params.id);
      res.json(contactTags);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contact tags" });
    }
  });

  app.post("/api/contacts/:id/tags/:tagId", async (req, res) => {
    try {
      await storage.addTagToContact(req.params.id, req.params.tagId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to add tag to contact" });
    }
  });

  app.delete("/api/contacts/:id/tags/:tagId", async (req, res) => {
    try {
      await storage.removeTagFromContact(req.params.id, req.params.tagId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove tag from contact" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
