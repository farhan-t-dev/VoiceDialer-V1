import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertContactSchema, 
  insertCallHistorySchema, 
  insertTagSchema, 
  insertCampaignSchema,
  insertAiAgentSchema,
  insertCallRecordingSchema,
  insertConversationTranscriptSchema
} from "@shared/schema";
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
      
      if (!success) {
        return res.status(500).json({ 
          success: false,
          error: 'Automated dial failed',
          message: 'Failed to complete the dial sequence'
        });
      }

      if (contactId) {
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
        success: false,
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

  // AI Agent routes
  app.get("/api/agents", async (_req, res) => {
    try {
      const agents = await storage.getAllAiAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch AI agents" });
    }
  });

  app.get("/api/agents/:id", async (req, res) => {
    try {
      const agent = await storage.getAiAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "AI agent not found" });
      }
      res.json(agent);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch AI agent" });
    }
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const validated = insertAiAgentSchema.parse(req.body);
      const agent = await storage.createAiAgent(validated);
      res.status(201).json(agent);
    } catch (error) {
      res.status(400).json({ error: "Invalid AI agent data" });
    }
  });

  app.patch("/api/agents/:id", async (req, res) => {
    try {
      const validated = insertAiAgentSchema.partial().parse(req.body);
      const agent = await storage.updateAiAgent(req.params.id, validated);
      if (!agent) {
        return res.status(404).json({ error: "AI agent not found" });
      }
      res.json(agent);
    } catch (error) {
      res.status(400).json({ error: "Invalid AI agent data" });
    }
  });

  app.delete("/api/agents/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAiAgent(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "AI agent not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete AI agent" });
    }
  });

  // Call Recording and Transcript routes
  app.get("/api/calls/:id/recording", async (req, res) => {
    try {
      const recording = await storage.getCallRecording(req.params.id);
      res.json(recording);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch call recording" });
    }
  });

  app.post("/api/calls/:id/recording", async (req, res) => {
    try {
      const validated = insertCallRecordingSchema.parse({
        ...req.body,
        callHistoryId: req.params.id,
      });
      const recording = await storage.createCallRecording(validated);
      res.status(201).json(recording);
    } catch (error) {
      res.status(400).json({ error: "Invalid recording data" });
    }
  });

  app.get("/api/calls/:id/transcripts", async (req, res) => {
    try {
      const transcripts = await storage.getConversationTranscripts(req.params.id);
      res.json(transcripts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transcripts" });
    }
  });

  app.post("/api/calls/:id/transcripts", async (req, res) => {
    try {
      const validated = insertConversationTranscriptSchema.parse({
        ...req.body,
        callHistoryId: req.params.id,
      });
      const transcript = await storage.createConversationTranscript(validated);
      res.status(201).json(transcript);
    } catch (error) {
      res.status(400).json({ error: "Invalid transcript data" });
    }
  });

  // Campaign routes
  app.get("/api/campaigns", async (_req, res) => {
    try {
      const campaigns = await storage.getAllCampaigns();
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const validated = insertCampaignSchema.parse(req.body);
      const campaign = await storage.createCampaign(validated);
      res.status(201).json(campaign);
    } catch (error) {
      res.status(400).json({ error: "Invalid campaign data" });
    }
  });

  app.patch("/api/campaigns/:id", async (req, res) => {
    try {
      const validated = insertCampaignSchema.partial().parse(req.body);
      const campaign = await storage.updateCampaign(req.params.id, validated);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      res.status(400).json({ error: "Invalid campaign data" });
    }
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCampaign(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  app.get("/api/campaigns/:id/contacts", async (req, res) => {
    try {
      const campaignContacts = await storage.getCampaignContacts(req.params.id);
      res.json(campaignContacts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaign contacts" });
    }
  });

  app.post("/api/campaigns/:id/contacts", async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!Array.isArray(contactIds)) {
        return res.status(400).json({ error: "contactIds must be an array" });
      }
      await storage.addContactsToCampaign(req.params.id, contactIds);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to add contacts to campaign" });
    }
  });

  // Bulk dial endpoint - process all contacts in a campaign
  app.post("/api/campaigns/:id/dial", async (req, res) => {
    try {
      const campaignId = req.params.id;
      const campaign = await storage.getCampaign(campaignId);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Get all pending contacts in the campaign
      const campaignContacts = await storage.getCampaignContacts(campaignId);
      const pendingContacts = campaignContacts.filter(cc => cc.status === 'pending');

      if (pendingContacts.length === 0) {
        return res.json({ 
          success: true, 
          message: 'No pending contacts to dial',
          totalProcessed: 0
        });
      }

      // Update campaign status to active
      await storage.updateCampaign(campaignId, { status: 'active' });

      // Process dial requests asynchronously
      res.json({ 
        success: true, 
        message: `Started dialing ${pendingContacts.length} contacts`,
        totalContacts: pendingContacts.length
      });

      // Process calls in the background
      (async () => {
        for (const cc of pendingContacts) {
          try {
            console.log(`Dialing contact ${cc.contact.name} (${cc.contact.phone})`);
            
            // Update status to calling
            await storage.updateCampaignContactStatus(
              campaignId,
              cc.contactId,
              'calling'
            );

            // Perform the automated dial
            const success = await automatedDial(cc.contact.phone);

            // Update status based on result
            const status = success ? 'completed' : 'failed';
            await storage.updateCampaignContactStatus(
              campaignId,
              cc.contactId,
              status,
              success ? 'Call completed successfully' : 'Call failed'
            );

            // Log the call history
            if (success) {
              await storage.createCallHistory({
                contactId: cc.contactId,
                status: 'completed',
                notes: `Campaign: ${campaign.name}`,
              });
            }

            // Wait 5 seconds between calls to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 5000));
          } catch (error) {
            console.error(`Failed to dial contact ${cc.contactId}:`, error);
            await storage.updateCampaignContactStatus(
              campaignId,
              cc.contactId,
              'failed',
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }

        // Mark campaign as completed
        await storage.updateCampaign(campaignId, { status: 'completed' });
        console.log(`Campaign ${campaign.name} completed`);
      })();

    } catch (error) {
      console.error('Campaign dial failed:', error);
      res.status(500).json({ 
        error: 'Failed to start campaign dialing',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
