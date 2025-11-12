import { Page } from 'playwright';
import WebSocket, { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { AudioTranscoder } from './audio-transcoder';
import { spawn } from 'child_process';
import { ElevenLabsConversationalClient } from './elevenlabs-conversational';
import { EventEmitter } from 'events';

export interface AudioStreamConfig {
  elevenLabsApiKey?: string; // Optional for public agents
  agentId: string; // ElevenLabs Conversational AI agent ID (required)
  voiceId?: string; // Legacy field for backwards compatibility
  agentPersonality?: string; // Legacy field
  conversationScript?: string; // Legacy field
  greeting?: string; // Legacy field
  objectionHandling?: string; // Legacy field
  closingScript?: string; // Legacy field
  playbackDevice?: string; // Device to play AI audio to (Line 2)
  agentName?: string; // AI agent name for dynamic variables
  contactName?: string; // Contact name for dynamic variables
}

export interface ConversationTurn {
  speaker: 'agent' | 'contact';
  message: string;
  timestamp: Date;
  audioChunkId?: string;
}

export class AudioStreamHandler extends EventEmitter {
  private page: Page;
  private config: AudioStreamConfig;
  private wsServer: WebSocketServer | null = null;
  private wsConnection: WebSocket | null = null;
  private conversationTranscript: ConversationTurn[] = [];
  private isProcessing: boolean = false;
  private isAcceptingChunks: boolean = false;
  private callId: string;
  private transcoder: AudioTranscoder;
  private wavFilePaths: string[] = [];
  private audioQueue: Array<{ buffer: Buffer; timestamp: number }> = [];
  private processingQueue: boolean = false;
  private consecutiveErrors: number = 0;
  private maxConsecutiveErrors: number = 10;
  private minChunkSize: number = 1024; // 1KB minimum
  private accumulatedChunks: Buffer[] = []; // Accumulate all chunks for end-of-call processing
  private elevenLabsClient: ElevenLabsConversationalClient | null = null; // WebSocket client for ElevenLabs
  private soxProcess: any = null; // Single persistent SoX process
  private soxPlaybackQueue: Array<{ buffer: Buffer; timestamp: number }> = []; // Queue for SoX playback
  private isSoxPlaying: boolean = false;
  private lastPlaybackTime: number = 0;
  private playbackGateMs: number = 200; // Mute capture for 200ms after playback to prevent feedback
  private selectedAudioDevice: string | null = null; // Track which device browser is using
  private isCleaningUp: boolean = false; // Prevent writing to streams during cleanup
  private conversationEndingDetected: boolean = false; // Track when AI says goodbye

  constructor(page: Page, config: AudioStreamConfig, callId: string) {
    super();
    this.page = page;
    this.config = config;
    this.callId = callId;
    this.transcoder = new AudioTranscoder();
  }

  async startAudioCapture(): Promise<void> {
    try {
      console.log(`[Audio] Starting audio capture for call ${this.callId}`);

      // Initialize ElevenLabs Conversational AI WebSocket client
      await this.setupElevenLabsConversational();

      // Set up local WebSocket for browser audio capture
      await this.setupAudioWebSocket();
      
      // Inject browser script to capture audio
      await this.injectAudioCaptureScript();

      this.isProcessing = true;
      this.isAcceptingChunks = true;

      console.log(`[Audio] Audio capture started successfully for call ${this.callId}`);
    } catch (error) {
      console.error('[Audio] Failed to start audio capture:', error);
      throw error;
    }
  }

  /**
   * Set up ElevenLabs Conversational AI WebSocket connection
   */
  private async setupElevenLabsConversational(): Promise<void> {
    try {
      console.log('[ElevenLabs] Initializing Conversational AI client');
      
      // Extract last name from contact name
      const contactName = this.config.contactName || 'Unknown';
      const nameParts = contactName.trim().split(/\s+/);
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : contactName;
      
      // Prepare dynamic variables
      const dynamicVariables: Record<string, string> = {
        agent_name: this.config.agentName || 'AI Assistant',
        recipientlast_name: lastName,
      };
      
      console.log('[ElevenLabs] Dynamic variables:', dynamicVariables);
      
      this.elevenLabsClient = new ElevenLabsConversationalClient({
        agentId: this.config.agentId,
        apiKey: this.config.elevenLabsApiKey,
        dynamicVariables,
      });

      // Set up event listeners
      this.elevenLabsClient.on('connected', () => {
        console.log('[ElevenLabs] Conversational AI connected successfully');
      });

      this.elevenLabsClient.on('audio_chunk', async ({ chunk, chunkId }) => {
        // Decode Base64 audio chunk and play it
        // ElevenLabs sends raw PCM audio (16kHz, 16-bit signed, mono)
        const audioBuffer = Buffer.from(chunk, 'base64');
        console.log(`[ElevenLabs] Received AI audio chunk (${audioBuffer.length} bytes)`);
        
        await this.playAudioResponse(audioBuffer);
        await this.saveToRecording(audioBuffer, 'pcm');
      });

      this.elevenLabsClient.on('user_transcript', ({ text, isFinal }) => {
        // ElevenLabs Conversational AI sends user_transcript without is_final flag
        // Save all non-empty user transcripts
        if (text && text.trim().length > 0) {
          console.log('[ElevenLabs] User said:', text);
          this.conversationTranscript.push({
            speaker: 'contact',
            message: text,
            timestamp: new Date(),
          });
        }
      });

      this.elevenLabsClient.on('agent_response', ({ text }) => {
        console.log('[ElevenLabs] AI responded:', text);
        this.conversationTranscript.push({
          speaker: 'agent',
          message: text,
          timestamp: new Date(),
        });
      });

      this.elevenLabsClient.on('interruption', (event) => {
        console.log('[ElevenLabs] 🛑 User interrupted the AI - clearing playback queue');
        // Immediately stop AI playback when user interrupts
        this.soxPlaybackQueue = [];
        this.isSoxPlaying = false;
        console.log('[Audio] ✓ Playback queue cleared due to interruption');
      });

      this.elevenLabsClient.on('conversation_ending', () => {
        console.log('[ElevenLabs] 🎬 Conversation ending detected - AI said goodbye');
        console.log('[ElevenLabs] Flagged for auto-hangup - will trigger after goodbye audio finishes playing');
        
        // Set flag instead of starting timer - let playback queue completion handle it
        this.conversationEndingDetected = true;
      });

      this.elevenLabsClient.on('error', (error) => {
        console.error('[ElevenLabs] WebSocket error:', error);
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          console.error('[ElevenLabs] Too many errors, stopping');
          this.stopCapture();
        }
      });

      this.elevenLabsClient.on('disconnected', () => {
        console.log('[ElevenLabs] Conversational AI disconnected');
      });

      // Connect to ElevenLabs
      await this.elevenLabsClient.connect();
      
    } catch (error) {
      console.error('[ElevenLabs] Failed to set up Conversational AI:', error);
      throw error;
    }
  }

  private async injectAudioCaptureScript(): Promise<void> {
    try {
      // Inject as raw JavaScript string to avoid TypeScript compilation artifacts
      const browserScript = `
        (async function() {
          console.log('[Browser] Initializing Web Audio API for real-time capture...');
          
          // CRITICAL FIX: Enumerate audio devices and select Line 1 specifically
          // This prevents feedback loop where AI hears itself from Line 2
          let selectedDeviceId = null;
          let selectedDeviceLabel = 'default';
          
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            console.log('[Browser] Available audio input devices:');
            audioInputs.forEach((device, index) => {
              console.log('  [' + index + '] ' + device.label + ' (ID: ' + device.deviceId.substring(0, 20) + '...)');
            });
            
            // PRIORITY-BASED DEVICE SCORING SYSTEM
            // Prevents false matches like "Default - Line 2" when looking for "Line 1"
            // Priority order: exact match > prefix match > regex match > contains match
            
            function normalizeLabel(label) {
              return label
                .toLowerCase()
                .replace(/^(default|communications)\s*-\s*/i, '') // Strip prefix
                .trim();
            }
            
            function scoreDevice(device) {
              const label = device.label;
              const normalized = normalizeLabel(label);
              
              // EXPLICIT REJECTION: Exclude any device with "Line 2" in the name
              if (normalized.includes('line 2')) {
                console.log('[Browser] ✗ Rejected (contains "Line 2"): ' + label);
                return -1;
              }
              
              // Reject "Communications" devices (usually bound to Line 2)
              if (label.toLowerCase().startsWith('communications')) {
                console.log('[Browser] ✗ Rejected (Communications device): ' + label);
                return -1;
              }
              
              // HIGHEST PRIORITY: Exact match
              if (normalized === 'line 1 (virtual audio cable)') {
                console.log('[Browser] ✓✓✓ Exact match (score 1000): ' + label);
                return 1000;
              }
              
              // HIGH PRIORITY: Starts with "Line 1"
              if (normalized.startsWith('line 1')) {
                console.log('[Browser] ✓✓ Prefix match (score 500): ' + label);
                return 500;
              }
              
              // MEDIUM PRIORITY: Regex pattern for Line 1 with variants
              if (/^line\\s*1(\\b|\\s|\\()/i.test(normalized)) {
                console.log('[Browser] ✓ Regex match (score 300): ' + label);
                return 300;
              }
              
              // LOW PRIORITY: Contains "cable output" or "vb-audio"
              if (normalized.includes('cable output') || normalized.includes('vb-audio virtual cable')) {
                console.log('[Browser] ~ Contains match (score 100): ' + label);
                return 100;
              }
              
              // FALLBACK: Not a match
              return 0;
            }
            
            // Score all devices and pick the highest
            let bestDevice = null;
            let bestScore = -1;
            
            audioInputs.forEach(device => {
              const score = scoreDevice(device);
              if (score > bestScore) {
                bestScore = score;
                bestDevice = device;
              }
            });
            
            if (bestDevice && bestScore > 0) {
              selectedDeviceId = bestDevice.deviceId;
              selectedDeviceLabel = bestDevice.label;
              console.log('[Browser] ================================================');
              console.log('[Browser] ✓ SELECTED DEVICE (score ' + bestScore + '): ' + bestDevice.label);
              console.log('[Browser] ✓ Device ID: ' + bestDevice.deviceId);
              console.log('[Browser] ✓ Will capture caller audio from Line 1 (NOT Line 2 - prevents feedback loop)');
              console.log('[Browser] ================================================');
            } else {
              console.warn('[Browser] ================================================');
              console.warn('[Browser] ⚠ WARNING: No Line 1 device found! Using default recording device.');
              console.warn('[Browser] ⚠ This WILL cause feedback loop if default is Line 2.');
              console.warn('[Browser] ⚠ Expected device names: "Line 1 (Virtual Audio Cable)", "Line 1", "CABLE Output"');
              console.warn('[Browser] ================================================');
            }
          } catch (err) {
            console.error('[Browser] Failed to enumerate devices:', err);
            console.warn('[Browser] Falling back to default recording device');
          }
          
          // Capture audio from Line 1 (caller's voice) instead of default (Line 2 = AI's voice)
          const audioConstraints = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: 16000
          };
          
          // Add deviceId if Line 1 was found
          if (selectedDeviceId) {
            audioConstraints.deviceId = { exact: selectedDeviceId };
          }
          
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: audioConstraints,
            video: false 
          });

          console.log('[Browser] Microphone stream obtained from: ' + (selectedDeviceId ? 'Line 1 (caller audio)' : 'default device'));
          
          // Report selected device to server for verification
          if (window.audioWebSocket && window.audioWebSocket.readyState === WebSocket.OPEN) {
            const deviceInfo = {
              type: 'device_selection',
              deviceLabel: selectedDeviceLabel,
              deviceId: selectedDeviceId ? selectedDeviceId.substring(0, 20) + '...' : null,
              isLine1: selectedDeviceId !== null
            };
            window.audioWebSocket.send(JSON.stringify(deviceInfo));
            console.log('[Browser] ✓ Reported device selection to server:', deviceInfo);
          }

          // Create Web Audio API context for real-time processing
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          const audioContext = new AudioContextClass({ sampleRate: 16000 });
          const source = audioContext.createMediaStreamSource(stream);
          
          // Use ScriptProcessorNode for real-time audio processing
          const bufferSize = 4096; // Process in 4096 sample chunks (~256ms at 16kHz)
          const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
          
          // Store for recording and cleanup
          window.audioContext = audioContext;
          window.audioStream = stream;
          window.audioProcessor = processor;
          window.audioChunks = []; // For complete recording
          
          let chunkCount = 0;
          
          // Helper function to convert Float32Array to Int16 PCM
          function floatTo16BitPCM(float32Array) {
            const buffer = new ArrayBuffer(float32Array.length * 2);
            const view = new DataView(buffer);
            let offset = 0;
            for (let i = 0; i < float32Array.length; i++, offset += 2) {
              const s = Math.max(-1, Math.min(1, float32Array[i]));
              view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
            return buffer;
          }
          
          // Process audio in real-time
          processor.onaudioprocess = function(event) {
            const inputData = event.inputBuffer.getChannelData(0); // Mono channel
            
            // Convert Float32 PCM to Int16 PCM
            const pcmData = floatTo16BitPCM(inputData);
            
            // Send ALL audio to ElevenLabs - let their VAD handle filtering
            if (window.audioWebSocket && window.audioWebSocket.readyState === WebSocket.OPEN) {
              window.audioWebSocket.send(pcmData);
              chunkCount++;
              
              if (chunkCount % 10 === 0) {
                console.log('[Browser] Streaming chunk #' + chunkCount + ' (' + pcmData.byteLength + ' bytes)');
              }
            }
            
            // Also accumulate for complete recording
            window.audioChunks.push(new Uint8Array(pcmData));
          };
          
          // Connect audio graph
          source.connect(processor);
          processor.connect(audioContext.destination);
          
          console.log('[Browser] Web Audio API pipeline active - streaming real-time audio');
          console.log('[Browser] Sample rate: 16kHz, Buffer size: ' + bufferSize + ' samples (~' + Math.round(bufferSize / 16) + ' ms per chunk)');
        })();
      `;

      await this.page.evaluate(browserScript);
      console.log('[Audio] Web Audio API capture script injected successfully');
    } catch (error) {
      console.error('[Audio] Failed to inject audio capture script:', error);
      throw error;
    }
  }

  private async setupAudioWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsPort = 8080 + Math.floor(Math.random() * 1000);
      const connectionTimeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout after 10 seconds'));
      }, 10000);

      this.wsServer = new WebSocketServer({ port: wsPort });
      
      this.wsServer.on('listening', async () => {
        console.log(`[WebSocket] Server listening on port ${wsPort}`);
        
        try {
          let connectionConfirmed = false;

          // Inject WebSocket client as raw JavaScript string to avoid TypeScript artifacts
          await this.page.evaluate(`
            (function() {
              return new Promise(function(resolveClient, rejectClient) {
                const ws = new WebSocket('ws://localhost:${wsPort}');
                window.audioWebSocket = ws;
                window.aiAudioQueue = []; // Queue for AI audio responses
                
                const clientTimeout = setTimeout(function() {
                  rejectClient(new Error('Client connection timeout'));
                }, 5000);

                ws.binaryType = 'arraybuffer';

                ws.onopen = function() {
                  clearTimeout(clientTimeout);
                  console.log('[Browser] Connected to audio WebSocket server');
                  resolveClient();
                };

                ws.onmessage = function(event) {
                  // Note: AI audio is now played directly from Node.js to Line 2 (not through browser)
                  // This WebSocket only handles audio capture, not playback
                  if (typeof event.data === 'string') {
                    try {
                      const controlMsg = JSON.parse(event.data);
                      console.log('[Browser] Control message:', controlMsg);
                    } catch (e) {
                      // Ignore parse errors
                    }
                  }
                  // No browser playback - prevents feedback loop!
                };

                ws.onerror = function(error) {
                  clearTimeout(clientTimeout);
                  console.error('[Browser] WebSocket error:', error);
                  rejectClient(new Error('WebSocket connection failed'));
                };
              });
            })();
          `);

          connectionConfirmed = true;
          clearTimeout(connectionTimeout);
          console.log('[WebSocket] Browser WebSocket client connected successfully');
        } catch (error) {
          clearTimeout(connectionTimeout);
          reject(error);
          return;
        }
      });

      this.wsServer.on('connection', (ws: WebSocket) => {
        console.log('[WebSocket] Server received connection');
        this.wsConnection = ws;
        clearTimeout(connectionTimeout);
        resolve();

        ws.on('message', async (message: Buffer | string) => {
          try {
            // Check if it's a JSON control message (device selection)
            if (typeof message === 'string' || (message instanceof Buffer && message[0] === 0x7b)) {
              try {
                const text = typeof message === 'string' ? message : message.toString();
                const controlMsg = JSON.parse(text);
                
                if (controlMsg.type === 'device_selection') {
                  this.selectedAudioDevice = controlMsg.deviceLabel;
                  if (controlMsg.isLine1) {
                    console.log(`[Audio] ✓ Browser confirmed Line 1 capture: ${controlMsg.deviceLabel}`);
                    console.log(`[Audio] ✓ Audio routing: Google Voice → Line 1 → AI (feedback loop prevented)`);
                  } else {
                    console.error(`[Audio] ❌ WARNING: Browser using default device instead of Line 1!`);
                    console.error(`[Audio] ❌ Device: ${controlMsg.deviceLabel}`);
                    console.error(`[Audio] ❌ This WILL cause feedback loop - AI hearing its own voice from Line 2`);
                    console.error(`[Audio] ❌ Fix: Ensure Virtual Audio Cable Line 1 is available in Windows`);
                  }
                  return;
                }
              } catch (e) {
                // Not JSON, continue to binary handling
              }
            }
            
            // Message is raw Int16 PCM audio data from Web Audio API
            if (message instanceof Buffer && message.length > 0) {
              
              if (this.isAcceptingChunks) {
                // Accumulate PCM chunks for complete recording
                this.accumulatedChunks.push(message);
                
                // Queue for real-time AI processing
                this.audioQueue.push({
                  buffer: message,
                  timestamp: Date.now()
                });
                
                // Process queue immediately for real-time conversation
                if (!this.processingQueue) {
                  this.processAudioQueue();
                }
              } else {
                console.warn('[Audio] Dropping audio chunk - no longer accepting');
              }
            } else {
              console.warn('[WebSocket] Received non-binary message, ignoring');
            }
          } catch (error) {
            console.error('[WebSocket] Error processing message:', error);
          }
        });

        ws.on('error', (error: Error) => {
          console.error('[WebSocket] WebSocket error:', error);
        });

        ws.on('close', () => {
          console.log('[WebSocket] Audio WebSocket disconnected');
        });
      });

      this.wsServer.on('error', (error: Error) => {
        console.error('[WebSocket] Server error:', error);
        clearTimeout(connectionTimeout);
        reject(error);
      });
    });
  }

  private async processAudioQueue(): Promise<void> {
    if (this.processingQueue) return;

    this.processingQueue = true;
    const queueLength = this.audioQueue.length;
    
    if (queueLength > 0) {
      console.log(`[Audio] Processing queue: ${queueLength} chunks pending`);
    }

    // Stream audio chunks directly to ElevenLabs Conversational AI
    while (this.audioQueue.length > 0) {
      const chunk = this.audioQueue.shift();
      if (!chunk) continue;
      
      // Stream this audio chunk to ElevenLabs WebSocket
      await this.streamAudioToElevenLabs(chunk.buffer);
    }

    this.processingQueue = false;
  }

  /**
   * Stream audio chunk to ElevenLabs Conversational AI via WebSocket
   */
  private async streamAudioToElevenLabs(audioChunk: Buffer): Promise<void> {
    try {
      // Validate chunk size - skip if too small
      if (audioChunk.length < this.minChunkSize) {
        console.log(`[Audio] Skipping chunk: too small (${audioChunk.length} < ${this.minChunkSize} bytes)`);
        return;
      }

      if (!this.isProcessing) {
        console.warn('[Audio] Cannot stream: isProcessing = false');
        return;
      }

      if (!this.elevenLabsClient) {
        console.warn('[Audio] Cannot stream: elevenLabsClient not initialized');
        return;
      }

      // Check if ElevenLabs client is connected
      if (!this.elevenLabsClient.getIsConnected()) {
        console.warn('[ElevenLabs] Client not connected, cannot send audio');
        return;
      }

      // PLAYBACK GATING: Mute capture for 200ms after AI playback to prevent feedback
      const timeSincePlayback = Date.now() - this.lastPlaybackTime;
      if (timeSincePlayback < this.playbackGateMs) {
        // Drop chunk during gate period to prevent AI from hearing itself
        const remainingGateMs = this.playbackGateMs - timeSincePlayback;
        console.log(`[Audio] 🚫 Gate active: dropping chunk (${remainingGateMs}ms remaining, ${audioChunk.length} bytes)`);
        return;
      }
      
      // Gate is inactive - chunk will be sent to AI
      if (timeSincePlayback < this.playbackGateMs + 100) {
        console.log(`[Audio] ✅ Gate inactive: chunk passing through (${timeSincePlayback}ms since playback, ${audioChunk.length} bytes)`);
      }

      // Convert raw PCM to Base64 (required format for ElevenLabs Conversational API)
      const base64Audio = audioChunk.toString('base64');

      // Send audio chunk to ElevenLabs WebSocket
      this.elevenLabsClient.sendAudioChunk(base64Audio);
      console.log(`[ElevenLabs] Sent audio chunk: ${audioChunk.length} bytes → ${base64Audio.length} base64 chars`);

      // Reset error counter on successful send
      this.consecutiveErrors = 0;
      
    } catch (error: any) {
      console.error('[ElevenLabs] Error streaming audio:', error);
      this.consecutiveErrors++;
      
      // Stop if too many errors
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error(`[ElevenLabs] Too many streaming errors, stopping audio processing`);
        await this.stopCapture();
      }
    }
  }

  private async playAudioResponse(audioBuffer: Buffer): Promise<void> {
    try {
      // Queue audio for playback instead of spawning new SoX process
      // This prevents overlapping voices
      if (this.config.playbackDevice) {
        console.log(`[Audio] Queueing AI audio: ${audioBuffer.length} bytes (16kHz, 16-bit signed, mono)`);
        
        // Add to playback queue
        this.soxPlaybackQueue.push({
          buffer: audioBuffer,
          timestamp: Date.now()
        });
        
        // Start processing queue if not already playing
        if (!this.isSoxPlaying) {
          this.processSoxPlaybackQueue();
        }
      } else {
        console.warn('[Audio] No playback device configured - audio will not be sent to Google Voice');
      }
    } catch (error) {
      console.error('[Audio] Failed to queue audio response:', error);
    }
  }

  /**
   * Process the SoX playback queue sequentially
   * Uses a single persistent SoX process to prevent overlapping voices
   */
  private async processSoxPlaybackQueue(): Promise<void> {
    if (this.isSoxPlaying) {
      return; // Already playing, queue will be processed when current chunk finishes
    }

    if (this.soxPlaybackQueue.length === 0) {
      return; // Nothing to play
    }

    this.isSoxPlaying = true;

    try {
      while (this.soxPlaybackQueue.length > 0 && !this.isCleaningUp) {
        const chunk = this.soxPlaybackQueue.shift();
        if (!chunk) continue;

        // Initialize or reuse SoX process
        await this.ensureSoxProcess();

        // Check if we're cleaning up or if stdin is writable
        if (this.isCleaningUp || !this.soxProcess || this.soxProcess.killed) {
          console.log('[Audio] Skipping playback - cleanup in progress or SoX not available');
          break;
        }

        if (!this.soxProcess.stdin || !this.soxProcess.stdin.writable) {
          console.warn('[Audio] SoX stdin not writable - skipping chunk');
          continue;
        }

        // Calculate playback duration
        const durationMs = (chunk.buffer.length / 2 / 16000) * 1000; // bytes / bytesPerSample / sampleRate * 1000
        
        // Log playback start
        const playbackStartTime = Date.now();
        console.log(`[Audio] 🎵 Playing AI audio chunk: ${chunk.buffer.length} bytes (~${Math.round(durationMs)}ms duration)`);
        this.lastPlaybackTime = playbackStartTime;
        
        try {
          // Write audio chunk to SoX stdin with error handling
          const writeSuccess = this.soxProcess.stdin.write(chunk.buffer);
          
          if (!writeSuccess) {
            // Handle backpressure - wait for drain event
            await new Promise<void>((resolve) => {
              this.soxProcess.stdin.once('drain', resolve);
            });
          }

          console.log(`[Audio] ✓ Streamed ${chunk.buffer.length} bytes to SoX (queue: ${this.soxPlaybackQueue.length} remaining)`);

          // Wait for playback to complete
          await new Promise(resolve => setTimeout(resolve, durationMs));

          // Log playback end and update gate time
          const playbackEndTime = Date.now();
          const actualDurationMs = playbackEndTime - playbackStartTime;
          this.lastPlaybackTime = playbackEndTime;
          console.log(`[Audio] ✓ Playback complete (actual: ${actualDurationMs}ms, gate active for ${this.playbackGateMs}ms)`);
        } catch (writeError: any) {
          // Handle write errors gracefully (e.g., EPIPE, EOF during cleanup)
          if (writeError.code === 'EOF' || writeError.code === 'EPIPE') {
            console.log('[Audio] SoX stream closed during write - cleanup likely in progress');
            break;
          } else {
            console.error('[Audio] Write error:', writeError);
          }
        }
      }
    } catch (error) {
      console.error('[Audio] Error processing SoX playback queue:', error);
      this.closeSoxProcess();
    } finally {
      this.isSoxPlaying = false;
      
      // Check if conversation ending was detected and queue is now empty
      if (this.conversationEndingDetected && this.soxPlaybackQueue.length === 0) {
        console.log('[Audio] ✓ Goodbye audio playback complete - starting 8-second hangup timer');
        setTimeout(() => {
          console.log('[Audio] ✓ Auto-hangup timer (8s) expired - triggering hangup');
          this.emit('request_hangup');
        }, 8000);
      }
    }
  }

  /**
   * Ensure SoX process is running and ready
   */
  private async ensureSoxProcess(): Promise<void> {
    if (this.soxProcess && !this.soxProcess.killed) {
      return; // Process already running
    }

    const isWindows = process.platform === 'win32';
    const soxExecutable = isWindows ? path.join(process.cwd(), 'tools', 'sox.exe') : 'sox';

    if (!fs.existsSync(soxExecutable)) {
      throw new Error(`SoX executable not found: ${soxExecutable}`);
    }

    const soxArgs = [
      '-t', 'raw',                      // Input type: raw PCM (no headers)
      '-r', '16000',                    // Sample rate: 16kHz
      '-e', 'signed',                   // Encoding: signed integers
      '-b', '16',                       // Bit depth: 16 bits
      '-c', '1',                        // Channels: 1 (mono)
      '-',                              // Read from stdin
      '-t', 'waveaudio',                // Output to Windows waveaudio driver
      this.config.playbackDevice!       // Target specific device by name
    ];

    console.log(`[Audio] 🎵 Starting persistent SoX process: ${soxExecutable} ${soxArgs.join(' ')}`);

    this.soxProcess = spawn(soxExecutable, soxArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    console.log(`[Audio] ✓ SoX process started (PID: ${this.soxProcess.pid})`);
    console.log(`[Audio] ✓ Playing to device: ${this.config.playbackDevice}`);

    // Add error handler to stdin to prevent unhandled errors during cleanup
    this.soxProcess.stdin.on('error', (err: any) => {
      // Gracefully handle EOF/EPIPE errors during cleanup
      if (err.code === 'EOF' || err.code === 'EPIPE') {
        console.log('[Audio] SoX stdin closed (cleanup in progress)');
      } else {
        console.error('[Audio] SoX stdin error:', err);
      }
    });

    // Handle SoX stderr
    this.soxProcess.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('In:') && !msg.includes('Done')) {
        console.log(`[SoX] ${msg}`);
      }
    });

    // Handle process exit
    this.soxProcess.on('close', (code: number) => {
      if (code !== 0 && code !== null) {
        console.error(`[Audio] ❌ SoX process exited with code ${code}`);
      } else {
        console.log(`[Audio] SoX process closed normally`);
      }
      this.soxProcess = null;
    });

    this.soxProcess.on('error', (err: Error) => {
      console.error(`[Audio] ❌ SoX process error:`, err);
      this.soxProcess = null;
    });

    // Give SoX a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Close the persistent SoX process
   */
  private closeSoxProcess(): void {
    if (this.soxProcess && !this.soxProcess.killed) {
      try {
        this.soxProcess.stdin.end();
        this.soxProcess.kill();
        console.log('[Audio] ✓ Closed SoX process');
      } catch (err) {
        console.warn('[Audio] Error closing SoX process:', err);
      }
      this.soxProcess = null;
    }
  }

  /**
   * Play raw PCM audio directly using SoX
   * ElevenLabs sends PCM in format: 16kHz, 16-bit signed, mono
   * No conversion needed - SoX plays it directly!
   */
  private async playSoxPcm(soxExecutable: string, pcmFilePath: string): Promise<void> {
    return new Promise((resolve) => {
      const soxArgs = [
        '-t', 'raw',                      // Input type: raw PCM (no headers)
        '-r', '16000',                    // Sample rate: 16kHz
        '-e', 'signed',                   // Encoding: signed integers
        '-b', '16',                       // Bit depth: 16 bits
        '-c', '1',                        // Channels: 1 (mono)
        pcmFilePath,                      // Input PCM file
        '-t', 'waveaudio',                // Output to Windows waveaudio driver
        this.config.playbackDevice!       // Target specific device by name
      ];
      
      console.log(`[Audio] 🎵 SoX PCM playback: ${soxExecutable} ${soxArgs.join(' ')}`);
      
      const soxPlay = spawn(soxExecutable, soxArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      
      console.log(`[Audio] ✓ Playing raw PCM to device: ${this.config.playbackDevice}`);
      console.log(`[Audio] 📊 Watch Line 2 in Windows Sound Settings for green bars`);
      
      // Log any SoX output or errors
      soxPlay.stderr.on('data', (data) => {
        console.log(`[SoX] ${data.toString().trim()}`);
      });
      
      soxPlay.on('close', (code) => {
        if (code === 0) {
          console.log(`[Audio] ✓ SoX PCM playback completed successfully`);
        } else {
          console.error(`[Audio] ❌ SoX PCM playback failed with code ${code}`);
        }
        resolve();
      });
      
      soxPlay.on('error', (err) => {
        console.error(`[Audio] ❌ SoX process error:`, err);
        resolve();
      });
    });
  }

  /**
   * Simple, reliable WAV playback using SoX
   * No MP3 decoding complexity, no libmad-0.dll needed
   */
  private async playSoxWav(soxExecutable: string, wavFilePath: string): Promise<void> {
    return new Promise((resolve) => {
      const soxArgs = [
        wavFilePath,                       // Input WAV file
        '-t', 'waveaudio',                // Output to Windows waveaudio driver
        this.config.playbackDevice!       // Target specific device by name
      ];
      
      console.log(`[Audio] 🎵 SoX WAV playback: ${soxExecutable} ${soxArgs.join(' ')}`);
      
      const soxPlay = spawn(soxExecutable, soxArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      
      console.log(`[Audio] ✓ Playing to device: ${this.config.playbackDevice}`);
      console.log(`[Audio] 📊 Watch Line 2 in Windows Sound Settings for green bars`);
      
      // Log any SoX output (should be minimal for WAV)
      soxPlay.stderr.on('data', (data) => {
        console.log(`[SoX] ${data.toString().trim()}`);
      });
      
      soxPlay.on('close', (code) => {
        if (code === 0) {
          console.log(`[Audio] ✓ SoX WAV playback completed successfully`);
        } else {
          console.error(`[Audio] ❌ SoX WAV playback failed with code ${code}`);
        }
        resolve();
      });
      
      soxPlay.on('error', (err) => {
        console.error(`[Audio] ❌ SoX process error:`, err);
        resolve();
      });
    });
  }

  private async saveToRecording(audioChunk: Buffer, format: 'webm' | 'mp3' | 'pcm'): Promise<void> {
    try {
      console.log(`[Recording] Transcoding ${format} audio chunk (${audioChunk.length} bytes)`);
      const wavPath = await this.transcoder.transcodeToWav(audioChunk, format);
      this.wavFilePaths.push(wavPath);
      console.log(`[Recording] Audio chunk transcoded to WAV: ${wavPath}`);
    } catch (error) {
      console.error('[Recording] Failed to save recording chunk:', error);
    }
  }

  private async finalizeRecording(): Promise<string> {
    const recordingDir = path.join(process.cwd(), 'recordings');
    
    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }

    const finalPath = path.join(recordingDir, `${this.callId}.wav`);

    if (this.wavFilePaths.length === 0) {
      console.log('[Recording] No audio chunks to finalize');
      return '';
    }

    try {
      console.log(`[Recording] Concatenating ${this.wavFilePaths.length} WAV files`);
      await this.transcoder.concatenateWavFiles(this.wavFilePaths, finalPath);
      console.log(`[Recording] Final recording saved to ${finalPath}`);
      
      await this.transcoder.cleanupTempFiles(this.wavFilePaths);
      this.wavFilePaths = [];
      
      return finalPath;
    } catch (error) {
      console.error('[Recording] Failed to finalize recording:', error);
      throw error;
    }
  }

  public getTranscript(): ConversationTurn[] {
    return this.conversationTranscript;
  }

  public getRecordingPath(): string {
    return path.join(process.cwd(), 'recordings', `${this.callId}.wav`);
  }

  async stopCapture(): Promise<void> {
    console.log(`[Audio] Stopping audio capture for call ${this.callId}`);

    // Set cleanup flag FIRST to prevent new writes
    this.isCleaningUp = true;

    // IMMEDIATELY stop all processing to prevent wasted API credits
    this.isProcessing = false;
    this.isAcceptingChunks = false;
    this.processingQueue = false;

    // Disconnect ElevenLabs Conversational AI WebSocket
    if (this.elevenLabsClient) {
      console.log('[ElevenLabs] Disconnecting Conversational AI client');
      this.elevenLabsClient.disconnect();
      this.elevenLabsClient = null;
    }

    // Clear queues
    this.audioQueue = [];
    this.soxPlaybackQueue = [];
    
    // Close persistent SoX process
    this.closeSoxProcess();
    
    // Stop Web Audio API processing
    await this.page.evaluate(`
      (function() {
        // Disconnect audio processor
        if (window.audioProcessor) {
          window.audioProcessor.disconnect();
          window.audioProcessor = null;
        }
        
        // Close audio context
        if (window.audioContext) {
          window.audioContext.close();
          window.audioContext = null;
        }
        
        // Stop audio stream tracks
        if (window.audioStream) {
          var tracks = window.audioStream.getTracks();
          for (var i = 0; i < tracks.length; i++) {
            tracks[i].stop();
          }
          window.audioStream = null;
        }
      })()
    `).catch(err => console.error('[Audio] Error stopping browser recording:', err));

    // Close browser WebSocket immediately
    await this.page.evaluate(`
      (function() {
        if (window.audioWebSocket) {
          window.audioWebSocket.close();
        }
      })()
    `).catch(err => console.error('[Audio] Error closing browser WebSocket:', err));

    console.log('[Audio] Audio capture stopped - accumulated chunks ready for recording');
  }

  async cleanup(): Promise<string> {
    console.log(`[Audio] Cleaning up resources for call ${this.callId}`);

    await this.stopCapture();

    // Process accumulated PCM chunks as complete audio file
    if (this.accumulatedChunks.length > 0) {
      console.log(`[Recording] Processing ${this.accumulatedChunks.length} accumulated PCM chunks`);
      try {
        const completePCM = Buffer.concat(this.accumulatedChunks);
        console.log(`[Recording] Complete PCM buffer: ${completePCM.length} bytes (${Math.round(completePCM.length / 32000)} seconds at 16kHz mono)`);
        
        // Convert PCM to WAV and save
        const wavPath = await this.transcoder.savePcmAsWav(completePCM, 16000, 1);
        this.wavFilePaths.push(wavPath);
        console.log(`[Recording] Complete audio saved as WAV: ${wavPath}`);
      } catch (error) {
        console.error('[Recording] Failed to process accumulated audio:', error);
      }
      this.accumulatedChunks = [];
    }

    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }

    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    const recordingPath = await this.finalizeRecording();

    console.log(`[Audio] Cleanup completed for call ${this.callId}`);
    
    return recordingPath;
  }
}
