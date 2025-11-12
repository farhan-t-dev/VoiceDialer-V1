import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface ConversationalAIConfig {
  agentId: string;
  apiKey?: string;
  dynamicVariables?: Record<string, string>;
}

export enum ConversationState {
  IDLE = 'IDLE',
  BUFFERING = 'BUFFERING',
  WAITING_FOR_RESPONSE = 'WAITING_FOR_RESPONSE',
  SPEAKING = 'SPEAKING',
  RECONNECTING = 'RECONNECTING',
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
  
  private state: ConversationState = ConversationState.IDLE;
  
  private lastAudioTimestamp: number = 0;
  private silenceThreshold: number = 1000; // 1000ms silence before AI responds (reduced from 1200ms for snappier responses)
  private silenceTimer: NodeJS.Timeout | null = null;
  private noReplyTimeout: NodeJS.Timeout | null = null;
  private noReplyTimeoutDuration: number = 10000;
  
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
    console.log('[ElevenLabs] 🔍 DIAGNOSTIC: Validating configuration');
    
    if (!this.config.agentId) {
      console.error('[ElevenLabs] ❌ DIAGNOSTIC: Missing agent ID!');
      throw new Error('Agent ID is required');
    }
    
    console.log('[ElevenLabs] ✓ DIAGNOSTIC: Agent ID format:', {
      agentId: this.config.agentId,
      length: this.config.agentId.length,
      format: this.config.agentId.startsWith('agent_') ? 'Valid (starts with agent_)' : '⚠️ Unusual format',
    });
    
    if (this.config.apiKey) {
      console.log('[ElevenLabs] ✓ DIAGNOSTIC: API key present:', {
        keyLength: this.config.apiKey.length,
        keyPrefix: this.config.apiKey.substring(0, 10) + '...',
      });
    } else {
      console.log('[ElevenLabs] ⚠️ DIAGNOSTIC: No API key provided (may use query param auth)');
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.intentionalDisconnect = false;
        
        const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${this.config.agentId}`;
        
        console.log('[ElevenLabs] 🔐 DIAGNOSTIC: Authentication method:', {
          agentIdInUrl: this.config.agentId,
          apiKeyPresent: !!this.config.apiKey,
          authMethod: this.config.apiKey ? 'API key (if sent in headers)' : 'Agent ID in query param only',
          fullUrl: wsUrl.replace(this.config.agentId, this.config.agentId.substring(0, 15) + '...'),
        });
        
        this.logWithTimestamp('Connecting to ElevenLabs WebSocket', { url: wsUrl });
        
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log('[ElevenLabs] ✅ DIAGNOSTIC: WebSocket OPEN event fired');
          console.log('[ElevenLabs] ✅ DIAGNOSTIC: Connection established successfully to:', wsUrl);
          console.log('[ElevenLabs] ✅ DIAGNOSTIC: Ready state:', this.ws?.readyState, '(1 = OPEN)');
          
          this.logWithTimestamp('WebSocket connection established');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.dynamicVariablesReady = false;
          this.audioQueue = [];
          this.startPingInterval();
          this.transitionState(ConversationState.IDLE);
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message: ConversationMessage = JSON.parse(data.toString());
            
            console.log('[ElevenLabs] 📥 DIAGNOSTIC: Raw incoming message:', JSON.stringify(message, null, 2));
            
            this.handleMessage(message);
          } catch (error) {
            console.error('[ElevenLabs] ❌ DIAGNOSTIC: Failed to parse message:', {
              error,
              rawData: data.toString().substring(0, 200) + '...',
            });
          }
        });

        this.ws.on('error', (error) => {
          console.error('[ElevenLabs] ❌ DIAGNOSTIC: WebSocket ERROR event:', {
            errorMessage: error.message,
            errorType: error.name,
            errorStack: error.stack?.substring(0, 300),
            wsReadyState: this.ws?.readyState,
            isConnected: this.isConnected,
          });
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          console.log('[ElevenLabs] 🔌 DIAGNOSTIC: WebSocket CLOSE event:', {
            code,
            reason: reason?.toString() || 'No reason provided',
            wasConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            intentionalDisconnect: this.intentionalDisconnect,
          });
          
          this.logWithTimestamp('WebSocket connection closed');
          this.isConnected = false;
          this.stopPingInterval();
          this.clearAllTimers();
          this.emit('disconnected');
          
          if (this.intentionalDisconnect) {
            this.logWithTimestamp('Intentional disconnect - skipping reconnection');
            return;
          }
          
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          } else {
            this.logWithTimestamp('Max reconnection attempts reached', { attempts: this.reconnectAttempts });
          }
        });
      } catch (error) {
        console.error('[ElevenLabs] Connection error:', error);
        reject(error);
      }
    });
  }

  private transitionState(newState: ConversationState): void {
    const oldState = this.state;
    const timestamp = new Date().toISOString();
    
    this.logWithTimestamp(`STATE TRANSITION: ${oldState} → ${newState}`, { timestamp });
    
    this.state = newState;
    
    this.emit('state_change', { oldState, newState, timestamp });
  }

  private handleMessage(message: ConversationMessage): void {
    this.logWithTimestamp(`Received event: ${message.type}`);
    
    switch (message.type) {
      case 'conversation_initiation_metadata':
        this.logWithTimestamp('Conversation initiated');
        this.emit('conversation_started', message);
        
        if (this.config.dynamicVariables && Object.keys(this.config.dynamicVariables).length > 0) {
          this.logWithTimestamp('Sending dynamic variables', this.config.dynamicVariables);
          this.sendDynamicVariables(this.config.dynamicVariables);
          console.log('[ElevenLabs] ✅ Dynamic variables sent - waiting 200ms before lifting audio gate');
        } else {
          console.log('[ElevenLabs] ✅ No dynamic variables - waiting 200ms before lifting audio gate');
        }
        
        setTimeout(() => {
          this.dynamicVariablesReady = true;
          console.log('[ElevenLabs] 🚦 Audio gate lifted after 200ms delay');
          this.flushAudioQueue();
        }, 200);
        break;

      case 'audio':
        if (message.audio_event?.audio_base_64) {
          this.emit('audio_chunk', {
            chunk: message.audio_event.audio_base_64,
            chunkId: message.audio_event.event_id,
          });
          
          if (this.state !== ConversationState.SPEAKING) {
            this.logWithTimestamp('🎙️ AI starting to speak');
            this.transitionState(ConversationState.SPEAKING);
            this.clearNoReplyTimeout();
          }
        }
        
        if (message.audio_event?.audio_end_ms !== undefined) {
          this.logWithTimestamp('🎙️ AI finished speaking');
          this.handleResponseCompleted();
        }
        break;

      case 'user_transcript':
        if (message.user_transcription_event) {
          const transcript = message.user_transcription_event.user_transcript;
          const isFinal = message.user_transcription_event.is_final;
          const confidence = message.user_transcription_event.confidence;
          
          // Log STT confidence for debugging
          if (isFinal && transcript) {
            console.log('[ElevenLabs] 📝 STT Result:', {
              text: transcript,
              confidence: confidence || 'N/A',
              length: transcript.length,
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
        if (message.agent_response_event) {
          const agentText = message.agent_response_event.agent_response;
          
          // Mark conversation as started on first agent response
          if (!this.conversationStarted) {
            this.conversationStarted = true;
            console.log('[ElevenLabs] ✓ Conversation started (first AI response detected)');
          }
          
          // Detect conversation end keywords
          const endKeywords = [
            'goodbye', 'god bless', 'have a great', 'have a blessed',
            'thank you so much', 'take care', 'talk to you', 'speak with you later'
          ];
          
          const textLower = agentText.toLowerCase();
          const hasEndKeyword = endKeywords.some(keyword => textLower.includes(keyword));
          
          if (hasEndKeyword && !this.conversationEnded) {
            this.conversationEnded = true;
            console.log('[ElevenLabs] ✓ Conversation ending detected:', agentText.substring(0, 100));
            this.emit('conversation_ending');
          }
          
          this.emit('agent_response', {
            text: agentText,
          });
        }
        break;

      case 'interruption':
        this.logWithTimestamp('User interrupted the AI');
        this.emit('interruption', message.interruption_event);
        this.handleInterruption();
        break;

      case 'agent_response_correction':
        this.logWithTimestamp('AI response correction');
        break;
      
      case 'ping':
        break;

      case 'pong':
        this.emit('pong');
        break;

      default:
        console.warn('[ElevenLabs] ⚠️ DIAGNOSTIC: Unhandled message type:', {
          type: message.type,
          fullMessage: JSON.stringify(message, null, 2),
        });
        this.logWithTimestamp(`Unknown message type: ${message.type}`);
    }
  }

  private validateAudioFormat(base64Audio: string): void {
    try {
      const buffer = Buffer.from(base64Audio, 'base64');
      
      console.log('[ElevenLabs] 🎵 DIAGNOSTIC: Audio format validation:', {
        base64Length: base64Audio.length,
        decodedBytes: buffer.length,
        expectedFormat: 'Raw PCM 16kHz mono (no WAV header)',
        upstreamSource: {
          captureMethod: 'Web Audio API ScriptProcessorNode',
          browserSampleRate: 16000,
          browserChannels: 1,
          browserBufferSize: 4096,
          conversion: 'Float32 → Int16LE PCM',
          note: 'Upstream audio-handler.ts captures at exactly 16kHz mono PCM',
        },
      });
      
      const bytesPerSample = 2;
      const sampleRate = 16000;
      const durationMs = (buffer.length / bytesPerSample / sampleRate) * 1000;
      
      console.log('[ElevenLabs] 🎵 DIAGNOSTIC: Decoded audio analysis:', {
        totalBytes: buffer.length,
        assumedBytesPerSample: bytesPerSample,
        assumedSampleRate: sampleRate,
        calculatedDurationMs: Math.round(durationMs),
        firstBytes: buffer.slice(0, 16).toString('hex'),
      });
      
      if (buffer.length < 100) {
        console.warn('[ElevenLabs] ⚠️ DIAGNOSTIC: Audio chunk suspiciously small!', {
          bytes: buffer.length,
          expected: 'At least 100 bytes for meaningful audio',
        });
      }
      
      if (buffer.length === 0) {
        console.error('[ElevenLabs] ❌ DIAGNOSTIC: Empty audio buffer! This will likely be rejected.');
      }
      
    } catch (error) {
      console.error('[ElevenLabs] ❌ DIAGNOSTIC: Failed to decode audio chunk:', error);
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

    if (!this.dynamicVariablesReady) {
      this.audioQueue.push(audioChunk);
      if (this.audioQueue.length === 1) {
        console.log('[ElevenLabs] 🚦 Audio gated: waiting for dynamic variables to be sent first');
      }
      return;
    }

    if (this.chunkCounter === 0) {
      this.validateAudioFormat(audioChunk);
    }

    const now = Date.now();
    this.lastAudioTimestamp = now;

    // Transition to BUFFERING if we're starting fresh
    if (this.state === ConversationState.IDLE) {
      this.transitionState(ConversationState.BUFFERING);
    }

    // CRITICAL FIX: Send audio in ALL states for full-duplex conversation
    // ElevenLabs Conversational AI is designed to accept audio continuously:
    // - Enables natural interruptions (caller can interrupt AI)
    // - Real-time listening (AI hears everything)
    // - Proper turn-taking detection
    // The state machine tracks conversation flow, but audio should always flow through
    
    try {
      const message = JSON.stringify({
        user_audio_chunk: audioChunk,
      });
      this.ws.send(message);
      this.chunkCounter++;
      
      // Log at different levels based on state
      if (this.state === ConversationState.SPEAKING) {
        // When AI is speaking, log interruptions clearly
        this.logWithTimestamp(`Sent audio chunk #${this.chunkCounter} (interruption detected)`, { 
          size: audioChunk.length,
          state: this.state
        });
      } else {
        this.logWithTimestamp(`Sent audio chunk #${this.chunkCounter}`, { 
          size: audioChunk.length,
        });
      }
    } catch (error) {
      console.error('[ElevenLabs] Failed to send audio chunk:', error);
    }

    // Only track silence during BUFFERING state (when user is actively speaking)
    if (this.state === ConversationState.BUFFERING) {
      this.resetSilenceTimer();
    }
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    this.silenceTimer = setTimeout(() => {
      this.handleSilenceDetected();
    }, this.silenceThreshold);
  }

  private handleSilenceDetected(): void {
    if (this.state !== ConversationState.BUFFERING) {
      return;
    }

    const timeSinceLastAudio = Date.now() - this.lastAudioTimestamp;
    
    if (timeSinceLastAudio >= this.silenceThreshold && this.chunkCounter > 0) {
      this.logWithTimestamp('Silence detected - requesting AI response', {
        silenceDuration: `${timeSinceLastAudio}ms`,
        totalChunksSent: this.chunkCounter,
      });
      
      this.transitionState(ConversationState.WAITING_FOR_RESPONSE);
      this.startNoReplyTimeout();
    }
  }

  private handleResponseCompleted(): void {
    this.clearNoReplyTimeout();
    
    this.chunkCounter = 0;
    
    this.transitionState(ConversationState.IDLE);
    this.logWithTimestamp('Ready for next turn');
  }

  private handleInterruption(): void {
    this.clearNoReplyTimeout();
    
    this.chunkCounter = 0;
    
    this.transitionState(ConversationState.IDLE);
  }

  private startNoReplyTimeout(): void {
    this.clearNoReplyTimeout();
    
    this.noReplyTimeout = setTimeout(() => {
      this.logWithTimestamp('No reply timeout - resetting to IDLE', {
        timeout: `${this.noReplyTimeoutDuration}ms`,
      });
      this.transitionState(ConversationState.IDLE);
    }, this.noReplyTimeoutDuration);
  }

  private clearNoReplyTimeout(): void {
    if (this.noReplyTimeout) {
      clearTimeout(this.noReplyTimeout);
      this.noReplyTimeout = null;
    }
  }

  private clearAllTimers(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.clearNoReplyTimeout();
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
    this.transitionState(ConversationState.RECONNECTING);
    
    this.dynamicVariablesReady = false;
    this.audioQueue = [];
    
    this.logWithTimestamp('Attempting reconnection', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay: `${this.reconnectDelay}ms`,
    });

    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

    try {
      await this.connect();
      this.logWithTimestamp('Reconnection successful');
      this.reconnectAttempts = 0;
    } catch (error) {
      this.logWithTimestamp('Reconnection failed', { 
        error,
        attempt: this.reconnectAttempts,
        willRetry: this.reconnectAttempts < this.maxReconnectAttempts,
      });
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        await this.attemptReconnect();
      } else {
        this.logWithTimestamp('Max reconnection attempts reached - giving up', {
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
      this.logWithTimestamp('Disconnecting WebSocket');
      this.intentionalDisconnect = true;
      this.stopPingInterval();
      this.clearAllTimers();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  getCurrentState(): ConversationState {
    return this.state;
  }

  private logWithTimestamp(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logData = data ? ` | ${JSON.stringify(data)}` : '';
    console.log(`[ElevenLabs ${timestamp}] ${message}${logData}`);
  }
}
