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
  insertConversationTranscriptSchema,
} from "@shared/schema";
import {
  automatedDial,
  getDialer,
  closeDialer,
} from "./google-voice-automation";
import { AudioStreamHandler } from "./audio-handler";
import { getWindowsAudioDevices } from "./audio-config";
import { CallState, type CallStateChange } from "./call-state-monitor";
import { type StateTransition } from "./call-state-detector";
import { campaignWebSocket } from "./websocket";

/**
 * Generate a random delay between 3-6 minutes (180000-360000ms)
 * This creates natural spacing between calls to avoid detection and rate limiting
 */
function getRandomCallDelay(): number {
  const minDelay = 3 * 60 * 1000; // 3 minutes in milliseconds
  const maxDelay = 6 * 60 * 1000; // 6 minutes in milliseconds
  const randomDelay =
    Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  return randomDelay;
}

/**
 * Format milliseconds to human-readable time
 */
function formatDelay(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/contacts", async (_req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
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
      console.log("Creating contact with data:", req.body);
      const validated = insertContactSchema.parse(req.body);
      console.log("Validated contact data:", validated);
      const contact = await storage.createContact(validated);
      console.log("Contact created successfully:", contact);
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
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
      console.error("Error fetching call history:", error);
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
          error: "Automated dial failed",
          message: "Failed to complete the dial sequence",
        });
      }

      if (contactId) {
        // Automatically log the call as completed
        const call = await storage.createCallHistory({
          contactId,
          status: "completed",
          notes: "Automated dial initiated",
        });

        return res.json({
          success: true,
          message: "Call initiated successfully",
          call,
        });
      }

      res.json({
        success: true,
        message: "Call initiated successfully",
      });
    } catch (error) {
      console.error("Automated dial failed:", error);
      res.status(500).json({
        success: false,
        error: "Failed to initiate automated dial",
        message: error instanceof Error ? error.message : "Unknown error",
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

      const created =
        results.successful.length > 0
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
      console.error("Error fetching tags:", error);
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

  // Audio Setup Validation
  app.get("/api/audio/validate-setup", async (_req, res) => {
    try {
      const audioDevices = getWindowsAudioDevices();
      
      // Return configuration and setup instructions
      res.json({
        success: true,
        configuration: {
          captureDevice: audioDevices.captureDevice,
          playbackDevice: audioDevices.playbackDevice,
          browserInput: audioDevices.browserInputDevice,
          browserOutput: audioDevices.browserOutputDevice,
        },
        setupInstructions: [
          "Open Windows Sound Settings (right-click speaker icon → Sounds)",
          `Set "${audioDevices.browserOutputDevice}" as Default Playback Device (for Google Voice audio output)`,
          `Set "${audioDevices.browserInputDevice}" as Default Recording Device (for AI audio input to Google Voice)`,
          "Close any open Playwright browser windows",
          "Restart your campaign to apply changes",
          "During a call, check Windows Sound Settings to verify green bars appear on both devices"
        ],
        troubleshooting: [
          "If browser shows 'fake' devices, delete the 'playwright-data' folder and restart",
          "Line 1 green bars should move when caller speaks (Google Voice → AI)",
          "Line 2 green bars should move when AI speaks (AI → Google Voice)",
          "If ffplay shows errors, ensure ffmpeg/ffplay is installed and in PATH"
        ]
      });
    } catch (error) {
      console.error("Error validating audio setup:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to validate audio setup",
        message: error instanceof Error ? error.message : "Unknown error"
      });
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
      const transcripts = await storage.getConversationTranscripts(
        req.params.id,
      );
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

  app.get("/api/calls/:id/interactions", async (req, res) => {
    try {
      const interactions = await storage.getCallInteractions(req.params.id);
      res.json(interactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch interactions" });
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

      // Get all campaign contacts
      const campaignContacts = await storage.getCampaignContacts(campaignId);

      // If restarting a completed/failed/paused campaign, reset failed contacts to pending
      if (
        campaign.status === "completed" ||
        campaign.status === "failed" ||
        campaign.status === "paused" ||
        campaign.status === "waiting_for_login"
      ) {
        const failedContacts = campaignContacts.filter(
          (cc) => cc.status === "failed",
        );

        if (failedContacts.length > 0) {
          console.log(
            `Resetting ${failedContacts.length} failed contacts to pending for campaign restart`,
          );
          for (const contact of failedContacts) {
            await storage.updateCampaignContactStatus(
              campaignId,
              contact.contactId,
              "pending",
            );
          }
          // Refresh campaign contacts after reset
          const updatedContacts = await storage.getCampaignContacts(campaignId);
          const pendingContacts = updatedContacts.filter(
            (cc) => cc.status === "pending",
          );

          if (pendingContacts.length === 0) {
            return res.json({
              success: true,
              message: "No contacts to dial",
              totalProcessed: 0,
            });
          }
        } else {
          // Check for pending contacts
          const pendingContacts = campaignContacts.filter(
            (cc) => cc.status === "pending",
          );

          if (pendingContacts.length === 0) {
            return res.json({
              success: true,
              message: "No pending contacts to dial",
              totalProcessed: 0,
            });
          }
        }
      }

      // Get pending contacts after any potential reset
      const finalContacts = await storage.getCampaignContacts(campaignId);
      const pendingContacts = finalContacts.filter(
        (cc) => cc.status === "pending",
      );

      if (pendingContacts.length === 0) {
        return res.json({
          success: true,
          message: "No pending contacts to dial",
          totalProcessed: 0,
        });
      }

      // Update campaign status to active
      await storage.updateCampaign(campaignId, { status: "active" });
      // Broadcast real-time update
      campaignWebSocket.broadcastCampaignStatusUpdate(campaignId, "active");

      // Process dial requests asynchronously
      res.json({
        success: true,
        message: `Started dialing ${pendingContacts.length} contacts`,
        totalContacts: pendingContacts.length,
      });

      // Process calls in the background
      (async () => {
        let aiAgent: any = null;
        let audioDevices: any = null;
        let dialer: any = null;

        try {
          // Check if campaign has AI agent assigned
          if (campaign.agentId) {
            aiAgent = await storage.getAiAgent(campaign.agentId);
            console.log(`Campaign using AI Agent: ${aiAgent?.name}`);
          }

          // Initialize dialer with audio devices if AI agent is present
          if (aiAgent && process.env.ELEVENLABS_API_KEY) {
            audioDevices = getWindowsAudioDevices();
            // Don't pass audio devices to Playwright - let browser use Windows default devices
            // This prevents Playwright from creating fake virtual devices
            dialer = await getDialer(
              undefined,  // Browser will use Windows default microphone
              undefined,  // Browser will use Windows default speaker
              {
                loginRequiredCallback: async () => {
                  console.log(
                    `[Campaign] Login required for: ${campaign.name}`,
                  );
                  await storage.updateCampaign(campaignId, {
                    status: "waiting_for_login",
                  });
                  campaignWebSocket.broadcastLoginRequired(
                    campaignId,
                    campaign.name,
                  );
                  campaignWebSocket.broadcastCampaignStatusUpdate(
                    campaignId,
                    "waiting_for_login",
                  );
                },
                loginSuccessCallback: async () => {
                  await storage.updateCampaign(campaignId, {
                    status: "active",
                  });
                  console.log(
                    "[Campaign] Login successful, status updated to active",
                  );
                  campaignWebSocket.broadcastCampaignStatusUpdate(
                    campaignId,
                    "active",
                  );
                },
                shouldContinueCallback: async () => {
                  const currentCampaign = await storage.getCampaign(campaignId);
                  return (
                    currentCampaign?.status === "active" ||
                    currentCampaign?.status === "waiting_for_login"
                  );
                },
              },
            );
          } else if (!aiAgent) {
            // Simple dialer without AI agent - pass callbacks during creation
            dialer = await getDialer(undefined, undefined, {
              loginRequiredCallback: async () => {
                console.log(`[Campaign] Login required for: ${campaign.name}`);
                await storage.updateCampaign(campaignId, {
                  status: "waiting_for_login",
                });
                campaignWebSocket.broadcastLoginRequired(
                  campaignId,
                  campaign.name,
                );
                campaignWebSocket.broadcastCampaignStatusUpdate(
                  campaignId,
                  "waiting_for_login",
                );
              },
              loginSuccessCallback: async () => {
                await storage.updateCampaign(campaignId, {
                  status: "active",
                });
                console.log(
                  "[Campaign] Login successful, status updated to active",
                );
                campaignWebSocket.broadcastCampaignStatusUpdate(
                  campaignId,
                  "active",
                );
              },
              shouldContinueCallback: async () => {
                const currentCampaign = await storage.getCampaign(campaignId);
                return (
                  currentCampaign?.status === "active" ||
                  currentCampaign?.status === "waiting_for_login"
                );
              },
            });
          }

          for (const cc of pendingContacts) {
            // Check if campaign has been stopped
            const currentCampaign = await storage.getCampaign(campaignId);
            if (!currentCampaign || currentCampaign.status !== "active") {
              console.log(
                `[Campaign] Campaign stopped or paused, exiting dial loop`,
              );
              break;
            }

            let audioHandler: AudioStreamHandler | null = null;
            let callHistoryId: string | null = null;

            try {
              console.log(
                `Dialing contact ${cc.contact.name} (${cc.contact.phone})`,
              );

              // Update status to calling
              await storage.updateCampaignContactStatus(
                campaignId,
                cc.contactId,
                "calling",
              );

              // Perform the automated dial
              let success = false;
              if (dialer) {
                // Use dialer with audio support
                success = await dialer.dialNumber(cc.contact.phone);
              } else {
                // Use simple automated dial
                success = await automatedDial(cc.contact.phone);
              }

              // Create call history record
              let callConnected = false;
              let callEndReason = "unknown";

              if (success) {
                const callHistory = await storage.createCallHistory({
                  contactId: cc.contactId,
                  status: "completed",
                  notes: `Campaign: ${campaign.name}`,
                });
                callHistoryId = callHistory.id;

                // Start call state monitoring with SIMPLIFIED detector

                if (dialer) {
                  const callDetector = dialer.createCallDetector({
                    initialWaitTime: 3000, // Wait 3 seconds before checking End call button
                    connectedCheckInterval: 500, // Check every 500ms while connected
                  });

                  // Track call state changes
                  let audioStarted = false; // Flag to ensure we only start audio once
                  let cancelDelay: (() => void) | null = null; // Function to cancel the delay
                  let isStillConnected = false; // Flag to track if call is still active
                  
                  const callEndPromise = new Promise<string>((resolve) => {
                    callDetector.onStateChange(async (transition: StateTransition) => {
                      console.log(
                        `[Campaign] Call state: ${transition.toState} - ${transition.reason}`,
                      );

                      if (transition.toState === "connected") {
                        callConnected = true;
                        isStillConnected = true;
                        
                        // ✅ START AUDIO ONLY AFTER CALL CONNECTS
                        if (!audioStarted && aiAgent && aiAgent.agentId) {
                          audioStarted = true;
                          const page = dialer.getPage();
                          if (page) {
                            const callId = `call_${Date.now()}_${cc.contactId}`;
                            
                            console.log(`[Campaign] Call connected! Waiting 8 seconds before starting AI...`);
                            console.log(`[Campaign] 🔇 Post-connection delay gives recipient time to answer and prevents AI from speaking during ringing`);
                            
                            // Create a cancellable delay using Promise.race
                            let delayTimer: NodeJS.Timeout;
                            const delayPromise = new Promise<boolean>((delayResolve) => {
                              delayTimer = setTimeout(() => delayResolve(true), 8000);
                            });
                            const cancelPromise = new Promise<boolean>((cancelResolve) => {
                              cancelDelay = () => {
                                clearTimeout(delayTimer);
                                cancelResolve(false);
                              };
                            });
                            
                            // Wait for either delay to complete OR call to end
                            const shouldContinue = await Promise.race([delayPromise, cancelPromise]);
                            
                            // Safety check: Only start AI if delay completed AND call is STILL connected
                            if (!shouldContinue || !isStillConnected) {
                              console.log(`[Campaign] ⚠️ Call ended during delay - skipping AI audio processing`);
                              return;
                            }
                            
                            console.log(`[Campaign] ✓ Delay complete. Starting AI audio processing...`);
                            
                            audioHandler = new AudioStreamHandler(
                              page,
                              {
                                agentId: aiAgent.agentId, // ElevenLabs Conversational AI agent ID
                                elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
                                voiceId: aiAgent.voiceId || undefined, // Legacy field
                                agentPersonality: aiAgent.personality || undefined,
                                conversationScript: aiAgent.conversationScript || undefined,
                                greeting: aiAgent.greeting || undefined,
                                objectionHandling: aiAgent.objectionHandling || undefined,
                                closingScript: aiAgent.closingScript || undefined,
                                playbackDevice: audioDevices.playbackDevice, // Play AI audio to Line 2
                                agentName: aiAgent.name, // AI agent name for dynamic variables
                                contactName: cc.contact.name, // Contact name for dynamic variables
                              },
                              callId,
                            );

                            // Listen for auto-hangup request from AI when conversation ends
                            audioHandler.on('request_hangup', async () => {
                              console.log('[Campaign] 🎬 Auto-hangup requested by AI - ending call gracefully');
                              try {
                                await dialer.hangup();
                                console.log('[Campaign] ✓ Call hung up successfully');
                              } catch (error) {
                                console.error('[Campaign] Error hanging up call:', error);
                              }
                            });

                            await audioHandler.startAudioCapture();
                            console.log(`AI audio processing started for call ${callId}`);
                          }
                        }
                      } else if (transition.toState === "ended") {
                        console.log("[Campaign] Call ended - stopping audio");
                        
                        // Mark call as disconnected to prevent AI from starting
                        isStillConnected = false;
                        
                        // Cancel the 8-second delay if it's still waiting
                        if (cancelDelay) {
                          cancelDelay();
                          console.log("[Campaign] ⚠️ Cancelled AI startup - call ended during delay");
                        }

                        // IMMEDIATELY stop audio processing
                        if (audioHandler) {
                          console.log("[Campaign] Stopping audio handler...");
                          await audioHandler.stopCapture();
                        }

                        resolve("ended");
                      } else if (transition.toState === "failed") {
                        console.log("[Campaign] Call failed - stopping audio");
                        
                        // Mark call as disconnected to prevent AI from starting
                        isStillConnected = false;
                        
                        // Cancel the 8-second delay if it's still waiting
                        if (cancelDelay) {
                          cancelDelay();
                          console.log("[Campaign] ⚠️ Cancelled AI startup - call failed during delay");
                        }

                        // IMMEDIATELY stop audio processing
                        if (audioHandler) {
                          console.log("[Campaign] Stopping audio handler...");
                          await audioHandler.stopCapture();
                        }

                        // Click hangup button to clean up UI
                        await dialer.hangup();

                        resolve("failed");
                      }
                    });
                  });

                  // Start monitoring - detector waits 3s then checks for End call button
                  await callDetector.start();

                  // NOTE: Audio processing now starts automatically when call reaches CONNECTED state
                  // See state change callback above where audioHandler is initialized

                  // Wait for call to end (or fail)
                  callEndReason = await callEndPromise;
                  console.log(
                    `[Campaign] Call ended with reason: ${callEndReason}`,
                  );

                  // Stop monitoring (detector auto-stops on terminal states, but call it anyway for cleanup)
                  await callDetector.stop();
                } else {
                  // No dialer - simple automated dial without monitoring
                  // Wait a default duration
                  await new Promise((resolve) => setTimeout(resolve, 30000));
                }
              }

              // Determine final status based on call end reason (not initial success)
              let finalStatus: "completed" | "failed" | "pending" = "failed";
              let statusMessage = "Call failed";

              if (dialer && callEndReason) {
                // Use call end reason to determine actual outcome
                if (callEndReason === "ended" && callConnected) {
                  finalStatus = "completed";
                  statusMessage = "Call completed successfully";
                } else if (callEndReason === "failed") {
                  finalStatus = "failed";
                  statusMessage = "Call failed to connect - no End call button detected";
                } else {
                  finalStatus = "failed";
                  statusMessage = `Call ended: ${callEndReason}`;
                }
              } else if (success) {
                // No dialer/monitoring - use initial success result
                finalStatus = "completed";
                statusMessage = "Call completed successfully";
              }

              // Update status based on actual call outcome
              await storage.updateCampaignContactStatus(
                campaignId,
                cc.contactId,
                finalStatus,
                statusMessage,
              );

              console.log(
                `[Campaign] Final status: ${finalStatus} - ${statusMessage}`,
              );
            } catch (error) {
              console.error(`Failed to dial contact ${cc.contactId}:`, error);
              await storage.updateCampaignContactStatus(
                campaignId,
                cc.contactId,
                "failed",
                error instanceof Error ? error.message : "Unknown error",
              );
            } finally {
              // Clean up audio handler for this call and save recording
              if (audioHandler !== null && callHistoryId) {
                try {
                  const recordingPath = await (audioHandler as AudioStreamHandler).cleanup();

                  if (recordingPath) {
                    await storage.createCallRecording({
                      callHistoryId: callHistoryId,
                      recordingUrl: recordingPath,
                      duration: "30",
                    });

                    const transcript = (audioHandler as AudioStreamHandler).getTranscript();
                    for (const turn of transcript) {
                      await storage.createConversationTranscript({
                        callHistoryId: callHistoryId,
                        speaker: turn.speaker,
                        message: turn.message,
                      });
                    }

                    console.log(
                      `Recording saved to ${recordingPath} with ${transcript.length} transcript entries`,
                    );
                  }
                } catch (error) {
                  console.error("Failed to save recording/transcript:", error);
                }
              } else if (audioHandler !== null) {
                await (audioHandler as AudioStreamHandler).cleanup();
              }

              // Generate random delay between 3-6 minutes for natural spacing between all calls
              // This applies to both successful and failed calls for consistent, robust behavior
              const delayBeforeNext = getRandomCallDelay();
              console.log(
                `[Campaign] Waiting ${formatDelay(delayBeforeNext)} before next call...`,
              );
              await new Promise((resolve) =>
                setTimeout(resolve, delayBeforeNext),
              );
            }
          }
        } finally {
          // Close dialer if we created one
          if (dialer) {
            await closeDialer();
          }

          // Check current campaign status - only mark as completed if not waiting for login
          const currentCampaign = await storage.getCampaign(campaignId);
          if (currentCampaign?.status === "waiting_for_login") {
            // Keep the campaign in waiting_for_login status so user can restart later
            console.log(`Campaign ${campaign.name} paused (waiting for login)`);
          } else {
            // Mark campaign as completed
            await storage.updateCampaign(campaignId, { status: "completed" });
            // Broadcast real-time update
            campaignWebSocket.broadcastCampaignStatusUpdate(
              campaignId,
              "completed",
            );
            console.log(`Campaign ${campaign.name} completed`);
          }
        }
      })();
    } catch (error) {
      console.error("Campaign dial failed:", error);
      res.status(500).json({
        error: "Failed to start campaign dialing",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Stop campaign endpoint
  app.post("/api/campaigns/:id/stop", async (req, res) => {
    try {
      const campaignId = req.params.id;
      const campaign = await storage.getCampaign(campaignId);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Reset any "calling" contacts back to "pending" so they can be retried
      const campaignContacts = await storage.getCampaignContacts(campaignId);
      const callingContacts = campaignContacts.filter(cc => cc.status === 'calling');
      
      if (callingContacts.length > 0) {
        console.log(`[Campaign] Resetting ${callingContacts.length} calling contacts to pending`);
        for (const contact of callingContacts) {
          await storage.updateCampaignContactStatus(
            campaignId,
            contact.contactId,
            "pending",
          );
        }
      }

      // Update campaign status to paused
      await storage.updateCampaign(campaignId, {
        status: "paused",
      });
      // Broadcast real-time update
      campaignWebSocket.broadcastCampaignStatusUpdate(campaignId, "paused");

      console.log(`[Campaign] ${campaign.name} stopped by user`);

      // Close the browser to stop the automation completely
      await closeDialer();
      console.log("[Campaign] Browser closed");

      res.json({
        success: true,
        message: "Campaign stopped successfully",
      });
    } catch (error) {
      console.error("Failed to stop campaign:", error);
      res.status(500).json({ error: "Failed to stop campaign" });
    }
  });

  // Reset campaign contacts endpoint (for restarting completed campaigns)
  app.post("/api/campaigns/:id/reset", async (req, res) => {
    try {
      const campaignId = req.params.id;
      const campaign = await storage.getCampaign(campaignId);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Get all campaign contacts
      const campaignContacts = await storage.getCampaignContacts(campaignId);
      
      if (campaignContacts.length === 0) {
        return res.status(400).json({ error: "No contacts in campaign" });
      }

      // Reset all contacts to pending status
      console.log(`[Campaign] Resetting ${campaignContacts.length} contacts to pending for restart`);
      for (const contact of campaignContacts) {
        await storage.updateCampaignContactStatus(
          campaignId,
          contact.contactId,
          "pending",
        );
      }

      // Update campaign status to draft so it can be started again
      await storage.updateCampaign(campaignId, {
        status: "draft",
      });
      
      // Broadcast real-time update
      campaignWebSocket.broadcastCampaignStatusUpdate(campaignId, "draft");

      console.log(`[Campaign] ${campaign.name} reset - all contacts pending`);

      res.json({
        success: true,
        message: "Campaign reset successfully",
        contactsReset: campaignContacts.length,
      });
    } catch (error) {
      console.error("Failed to reset campaign:", error);
      res.status(500).json({ error: "Failed to reset campaign" });
    }
  });

  // Settings endpoints - store browser context to keep it alive
  let settingsBrowserContext: any = null;

  app.post("/api/settings/open-google-voice", async (_req, res) => {
    try {
      // Check if browser is already open
      if (settingsBrowserContext) {
        try {
          // Try to access existing context to see if it's still valid
          const pages = settingsBrowserContext.pages();
          if (pages.length > 0) {
            // Browser is already open - just navigate to Google Voice
            const page = pages[0];
            await page.goto('https://voice.google.com');
            console.log('[Settings] Browser already open - navigated to Google Voice');
            return res.json({ success: true, message: "Browser already open - navigated to Google Voice" });
          }
        } catch (e) {
          // Context is stale, close it
          console.log('[Settings] Closing stale browser context');
          try {
            await settingsBrowserContext.close();
          } catch (closeError) {
            // Ignore close errors
          }
          settingsBrowserContext = null;
        }
      }

      const { chromium } = await import("playwright");
      const path = await import("path");
      
      // Use the same profile directory as the automation
      const userDataDir = path.join(process.cwd(), 'playwright-data', 'google-voice-profile');
      
      // Launch Playwright Chromium with persistent context (same as automation)
      settingsBrowserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--autoplay-policy=no-user-gesture-required',
          '--enable-features=VaapiVideoDecoder'
        ],
        permissions: ['microphone', 'camera'],
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      });

      // Grant permissions for Google Voice
      await settingsBrowserContext.grantPermissions(['microphone', 'camera'], { 
        origin: 'https://voice.google.com' 
      });

      // Get or create a page
      const pages = settingsBrowserContext.pages();
      const page = pages.length > 0 ? pages[0] : await settingsBrowserContext.newPage();
      
      // Navigate to Google Voice home page
      await page.goto('https://voice.google.com');
      
      console.log('[Settings] Opened Google Voice in Playwright Chromium for manual login');
      console.log('[Settings] Browser context stored - window will stay open');
      
      res.json({ success: true, message: "Opening Google Voice in Chromium" });
    } catch (error) {
      console.error("Failed to open Google Voice:", error);
      settingsBrowserContext = null; // Clear on error
      res.status(500).json({ error: "Failed to open browser" });
    }
  });

  app.post("/api/settings/open-env-file", async (_req, res) => {
    try {
      const { exec } = await import("child_process");
      const path = await import("path");
      
      // Open .env file in default text editor
      const envPath = path.join(process.cwd(), ".env");
      
      // Windows command to open file with default editor
      exec(`notepad "${envPath}"`, (error) => {
        if (error) {
          console.error("Error opening .env file:", error);
        }
      });
      
      res.json({ success: true, message: "Opening .env file in text editor" });
    } catch (error) {
      console.error("Failed to open .env file:", error);
      res.status(500).json({ error: "Failed to open file" });
    }
  });

  const httpServer = createServer(app);

  // Initialize WebSocket server for real-time updates
  campaignWebSocket.initialize(httpServer);

  return httpServer;
}
