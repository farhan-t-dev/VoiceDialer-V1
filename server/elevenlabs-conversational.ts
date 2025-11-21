import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Simplified ElevenLabs Conversational AI Client
 * 
 * This is a streamlined WebSocket client that trusts ElevenLabs' built-in features:
 * - Automatic Voice Activity Detection (VAD)
 * - Automatic turn-taking via mode_change events
 * - Real-time bidirectional audio streaming
 * 
 * Removed complexity:
 * - Custom state machine (IDLE/BUFFERING/WAITING/SPEAKING)
 * - Custom 700ms silence detection
 * - Complex audio buffering logic
 * - Manual turn-taking coordination
 * 
 * Result: ~500 lines → ~150 lines (70% reduction)
 */

export interface ConversationalAIConfig {
  agentId: string;
  apiKey: string; // Required for WebSocket authentication
  dynamicVariables?: Record<string, string>;
}

interface ConversationMessage {
  type: string;
  [key: string]: any;
}

export class ElevenLabsConversationalClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: ConversationalAIConfig;
  private isConnected: boolean = false;
  private pingInterval: NodeJS.Timeout | null = null;
  
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  
  private chunkCounter: number = 0;
  private intentionalDisconnect: boolean = false;
  
  private dynamicVariablesReady: boolean = false;
  private audioQueue: string[] = [];
  
  // Conversation lifecycle flags
  private conversationStarted: boolean = false;
  private conversationEnded: boolean = false;

  constructor(config: ConversationalAIConfig) {
    super();
    this.config = config;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.agentId) {
      console.error('[ElevenLabs] Missing agent ID');
      throw new Error('Agent ID is required');
    }
    if (!this.config.apiKey) {
      console.error('[ElevenLabs] Missing API key');
      throw new Error('API key is required for authentication');
    }
    console.log('[ElevenLabs] Configuration validated');
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.intentionalDisconnect = false;
        
        const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${this.config.agentId}`;
        
        this.log('Connecting to ElevenLabs WebSocket with authentication');
        
        // Track handshake state to properly handle initial connection failures
        let hasOpenedSuccessfully = false;
        
        // Include API key authentication header (required for private agents)
        this.ws = new WebSocket(wsUrl, {
          headers: {
            'xi-api-key': this.config.apiKey,
          },
        });

        this.ws.on('open', () => {
          this.log('✓ WebSocket connection established');
          hasOpenedSuccessfully = true;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.dynamicVariablesReady = false;
          this.audioQueue = [];
          this.startPingInterval();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message: ConversationMessage = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('[ElevenLabs] Failed to parse message:', error);
          }
        });

        this.ws.on('error', (error) => {
          console.error('[ElevenLabs] WebSocket error:', error.message);
          this.emit('error', error);
          // Don't reject here - let the close handler decide based on handshake state
        });

        this.ws.on('close', (code, reason) => {
          this.log(`WebSocket closed (code: ${code})`);
          this.isConnected = false;
          this.stopPingInterval();
          this.emit('disconnected');
          
          // If connection closed before ever opening successfully, reject the promise
          if (!hasOpenedSuccessfully) {
            const errorMessage = `Failed to establish initial connection: ${code} - ${reason || 'Connection closed'}`;
            this.log(errorMessage);
            reject(new Error(errorMessage));
            return;
          }
          
          // Connection was established previously but closed - attempt reconnection
          if (this.intentionalDisconnect) {
            this.log('Intentional disconnect - skipping reconnection');
            return;
          }
          
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          } else {
            this.log(`Max reconnection attempts reached (${this.reconnectAttempts})`);
          }
        });
      } catch (error) {
        console.error('[ElevenLabs] Connection error:', error);
        reject(error);
      }
    });
  }

  private handleMessage(message: ConversationMessage): void {
    this.log(`Event: ${message.type}`);
    
    switch (message.type) {
      case 'conversation_initiation_metadata':
        this.log('Conversation initiated');
        this.emit('conversation_started', message);
        
        // Send dynamic variables (agentName, contactName) to ElevenLabs
        if (this.config.dynamicVariables && Object.keys(this.config.dynamicVariables).length > 0) {
          this.log('Sending dynamic variables', this.config.dynamicVariables);
          this.sendDynamicVariables(this.config.dynamicVariables);
          console.log('[ElevenLabs] ✅ Dynamic variables sent - waiting 200ms before lifting audio gate');
        } else {
          console.log('[ElevenLabs] ✅ No dynamic variables - waiting 200ms before lifting audio gate');
        }
        
        // Small delay to ensure variables are processed before audio starts flowing
        setTimeout(() => {
          this.dynamicVariablesReady = true;
          console.log('[ElevenLabs] 🚦 Audio gate lifted after 200ms delay');
          this.flushAudioQueue();
        }, 200);
        break;

      case 'audio':
        // AI is speaking - send audio chunks to be played via SoX
        if (message.audio_event?.audio_base_64) {
          this.emit('audio_chunk', {
            chunk: message.audio_event.audio_base_64,
            chunkId: message.audio_event.event_id,
          });
        }
        
        // AI finished speaking
        if (message.audio_event?.audio_end_ms !== undefined) {
          this.log('🎙️ AI finished speaking');
          this.emit('audio_end');
        }
        break;

      case 'user_transcript':
        // User's speech transcribed by ElevenLabs' STT
        if (message.user_transcription_event) {
          const transcript = message.user_transcription_event.user_transcript;
          const isFinal = message.user_transcription_event.is_final;
          const confidence = message.user_transcription_event.confidence;
          
          if (isFinal && transcript) {
            console.log('[ElevenLabs] 📝 User said:', {
              text: transcript,
              confidence: confidence || 'N/A',
            });
          }
          
          this.emit('user_transcript', {
            text: transcript,
            isFinal: isFinal,
            confidence: confidence,
          });
        }
        break;

      case 'agent_response':
        // AI's text response
        if (message.agent_response_event) {
          const agentText = message.agent_response_event.agent_response;
          
          // Mark conversation as started on first agent response
          if (!this.conversationStarted) {
            this.conversationStarted = true;
            console.log('[ElevenLabs] ✓ Conversation started (first AI response detected)');
          }
          
          // Detect conversation end keywords for auto-hangup
          const endKeywords = [
            'goodbye', 'god bless', 'have a great', 'have a blessed',
            'thank you so much', 'take care', 'talk to you', 'speak with you later'
          ];
          
          const textLower = agentText.toLowerCase();
          const hasEndKeyword = endKeywords.some(keyword => textLower.includes(keyword));
          
          if (hasEndKeyword && !this.conversationEnded) {
            this.conversationEnded = true;
            console.log('[ElevenLabs] 🎬 Conversation ending detected:', agentText.substring(0, 100));
            this.emit('conversation_ending');
          }
          
          this.emit('agent_response', {
            text: agentText,
          });
        }
        break;

      case 'interruption':
        // User interrupted the AI - ElevenLabs handles this automatically
        this.log('User interrupted the AI');
        this.emit('interruption', message.interruption_event);
        break;

      case 'mode_change':
        // ElevenLabs' automatic turn-taking system
        // mode: 'speaking' (AI is talking) or 'listening' (AI is waiting for user)
        if (message.mode_change_event) {
          const mode = message.mode_change_event.mode;
          this.log(`🔄 Mode change: ${mode}`);
          this.emit('mode_change', { mode });
        }
        break;

      case 'agent_response_correction':
        // AI corrected its previous response
        this.log('AI response correction');
        break;
      
      case 'ping':
        break;

      case 'pong':
        this.emit('pong');
        break;

      default:
        this.log(`Unknown message type: ${message.type}`);
    }
  }

  private sendDynamicVariables(variables: Record<string, string>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[ElevenLabs] Cannot send dynamic variables: WebSocket not open');
      return;
    }

    const message = {
      type: 'conversation_initiation_client_data',
      dynamic_variables: variables,
    };

    this.ws.send(JSON.stringify(message));
    console.log('[ElevenLabs] Sent dynamic variables:', variables);
  }

  sendAudioChunk(audioChunk: string): void {
    if (!this.isConnected || !this.ws) {
      console.warn('[ElevenLabs] Cannot send audio: not connected');
      return;
    }
    
    // Stop sending audio after conversation ends
    if (this.conversationEnded) {
      console.log('[ElevenLabs] 🚫 Conversation ended - ignoring audio chunk');
      return;
    }

    // Queue audio until dynamic variables are sent (prevents audio from arriving before agent context)
    if (!this.dynamicVariablesReady) {
      this.audioQueue.push(audioChunk);
      if (this.audioQueue.length === 1) {
        console.log('[ElevenLabs] 🚦 Audio gated: waiting for dynamic variables to be sent first');
      }
      return;
    }

    // Validate first audio chunk format
    if (this.chunkCounter === 0) {
      try {
        const buffer = Buffer.from(audioChunk, 'base64');
        console.log('[ElevenLabs] First audio chunk: ' + buffer.length + ' bytes (16kHz mono PCM)');
      } catch (error) {
        console.error('[ElevenLabs] Failed to decode audio chunk:', error);
      }
    }

    // Send audio chunk to ElevenLabs
    // Note: ElevenLabs supports full-duplex conversation (send audio even while AI is speaking)
    // This enables natural interruptions and real-time listening
    try {
      const message = JSON.stringify({
        user_audio_chunk: audioChunk,
      });
      this.ws.send(message);
      this.chunkCounter++;
      
      // Log every 100 chunks to avoid spam
      if (this.chunkCounter % 100 === 0) {
        this.log(`Sent ${this.chunkCounter} audio chunks`, { size: audioChunk.length });
      }
    } catch (error) {
      console.error('[ElevenLabs] Failed to send audio chunk:', error);
    }
  }

  private flushAudioQueue(): void {
    if (this.audioQueue.length === 0) {
      return;
    }

    console.log(`[ElevenLabs] 🚀 Flushing ${this.audioQueue.length} queued audio chunks`);
    
    const queuedChunks = [...this.audioQueue];
    this.audioQueue = [];
    
    for (const chunk of queuedChunks) {
      this.sendAudioChunk(chunk);
    }
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    
    this.dynamicVariablesReady = false;
    this.audioQueue = [];
    
    this.log('Attempting reconnection', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay: `${this.reconnectDelay}ms`,
    });

    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

    try {
      await this.connect();
      this.log('Reconnection successful');
      this.reconnectAttempts = 0;
    } catch (error) {
      this.log('Reconnection failed', { 
        error,
        attempt: this.reconnectAttempts,
        willRetry: this.reconnectAttempts < this.maxReconnectAttempts,
      });
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        await this.attemptReconnect();
      } else {
        this.log('Max reconnection attempts reached - giving up', {
          totalAttempts: this.reconnectAttempts,
        });
      }
    }
  }

  private sendPing(): void {
    if (!this.isConnected || !this.ws) return;

    try {
      const message = JSON.stringify({ type: 'ping' });
      this.ws.send(message);
    } catch (error) {
      console.error('[ElevenLabs] Failed to send ping:', error);
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 10000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.log('Disconnecting WebSocket');
      this.intentionalDisconnect = true;
      this.stopPingInterval();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  private log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logData = data ? ` | ${JSON.stringify(data)}` : '';
    console.log(`[ElevenLabs ${timestamp}] ${message}${logData}`);
  }
}
