import { Page } from 'playwright';
import WebSocket, { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { AudioTranscoder } from './audio-transcoder';

export interface AudioStreamConfig {
  elevenLabsApiKey: string;
  voiceId: string;
  agentPersonality: string;
  conversationScript: string;
  greeting?: string;
  objectionHandling?: string;
  closingScript?: string;
}

export interface ConversationTurn {
  speaker: 'agent' | 'contact';
  message: string;
  timestamp: Date;
  audioChunkId?: string;
}

export class AudioStreamHandler {
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

  constructor(page: Page, config: AudioStreamConfig, callId: string) {
    this.page = page;
    this.config = config;
    this.callId = callId;
    this.transcoder = new AudioTranscoder();
  }

  async startAudioCapture(): Promise<void> {
    try {
      console.log(`[Audio] Starting audio capture for call ${this.callId}`);

      await this.setupAudioWebSocket();
      
      await this.injectAudioCaptureScript();

      this.isProcessing = true;
      this.isAcceptingChunks = true;

      console.log(`[Audio] Audio capture started successfully for call ${this.callId}`);
    } catch (error) {
      console.error('[Audio] Failed to start audio capture:', error);
      throw error;
    }
  }

  private async injectAudioCaptureScript(): Promise<void> {
    try {
      await this.page.evaluate(() => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const destination = audioContext.createMediaStreamDestination();
        
        const mediaElements = document.querySelectorAll('audio, video');
        mediaElements.forEach((element: any) => {
          try {
            const source = audioContext.createMediaElementSource(element);
            source.connect(destination);
            source.connect(audioContext.destination);
          } catch (err) {
            console.error('Error connecting media element:', err);
          }
        });

        const mediaRecorder = new MediaRecorder(destination.stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 128000
        });

        (window as any).audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            (window as any).audioChunks.push(event.data);
            
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = (reader.result as string).split(',')[1];
              if ((window as any).audioWebSocket && (window as any).audioWebSocket.readyState === WebSocket.OPEN) {
                (window as any).audioWebSocket.send(JSON.stringify({
                  type: 'audio',
                  data: base64data,
                  timestamp: Date.now()
                }));
              }
            };
            reader.readAsDataURL(event.data);
          }
        };

        mediaRecorder.start(1000);
        (window as any).mediaRecorder = mediaRecorder;

        console.log('[Browser] Audio recording started');
      });

      console.log('[Audio] Audio capture script injected successfully');
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

          await this.page.evaluate((port) => {
            return new Promise<void>((resolveClient, rejectClient) => {
              const ws = new WebSocket(`ws://localhost:${port}`);
              (window as any).audioWebSocket = ws;
              
              const clientTimeout = setTimeout(() => {
                rejectClient(new Error('Client connection timeout'));
              }, 5000);

              ws.onopen = () => {
                clearTimeout(clientTimeout);
                console.log('[Browser] Connected to audio WebSocket server');
                resolveClient();
              };

              ws.onerror = (error: any) => {
                clearTimeout(clientTimeout);
                console.error('[Browser] WebSocket error:', error);
                rejectClient(new Error('WebSocket connection failed'));
              };
            });
          }, wsPort);

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

        ws.on('message', async (message: string) => {
          try {
            const data = JSON.parse(message);
            
            if (data.type === 'audio' && data.data) {
              const audioBuffer = Buffer.from(data.data, 'base64');
              
              if (this.isAcceptingChunks) {
                this.audioQueue.push({
                  buffer: audioBuffer,
                  timestamp: data.timestamp || Date.now()
                });
                
                this.conversationTranscript.push({
                  speaker: 'contact',
                  message: '[Contact Audio Captured]',
                  timestamp: new Date(),
                });

                if (!this.processingQueue) {
                  this.processAudioQueue();
                }
              } else {
                console.warn('[Audio] Dropping audio chunk - no longer accepting');
              }
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

    while (this.audioQueue.length > 0) {
      const audioItem = this.audioQueue.shift();
      if (audioItem) {
        await this.processWithElevenLabs(audioItem.buffer);
      }
    }

    this.processingQueue = false;
  }

  private async processWithElevenLabs(audioChunk: Buffer): Promise<void> {
    try {
      console.log(`[ElevenLabs] Processing audio chunk (${audioChunk.length} bytes)`);

      await this.saveToRecording(audioChunk, 'webm');

      if (!this.isProcessing) {
        console.log('[ElevenLabs] Skipping AI processing - call ending');
        return;
      }

      const formData = new FormData();
      const audioBlob = new Blob([audioChunk], { type: 'audio/webm' });
      formData.append('audio', audioBlob);
      formData.append('model_id', 'eleven_english_sts_v2');
      formData.append('voice_settings', JSON.stringify({
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.5,
        use_speaker_boost: true
      }));
      
      const contextPrompt = this.generateContextualPrompt();
      if (contextPrompt) {
        formData.append('text', contextPrompt);
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/speech-to-speech/${this.config.voiceId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': this.config.elevenLabsApiKey,
          },
          body: formData as any,
        }
      );

      if (response.ok) {
        const aiAudioResponse = await response.arrayBuffer();
        const aiAudioBuffer = Buffer.from(aiAudioResponse);
        
        console.log(`[ElevenLabs] Received AI response (${aiAudioBuffer.length} bytes)`);

        await this.playAudioResponse(aiAudioBuffer);
        await this.saveToRecording(aiAudioBuffer, 'mp3');

        this.conversationTranscript.push({
          speaker: 'agent',
          message: '[AI Audio Response]',
          timestamp: new Date(),
          audioChunkId: `chunk_${Date.now()}`
        });
      } else {
        const errorText = await response.text();
        console.error(`[ElevenLabs] API error: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('[ElevenLabs] Processing error:', error);
    }
  }

  private generateContextualPrompt(): string {
    let prompt = this.config.conversationScript || '';

    if (this.config.greeting) {
      prompt = `Greeting: ${this.config.greeting}\n\n${prompt}`;
    }

    if (this.config.agentPersonality) {
      prompt = `Personality: ${this.config.agentPersonality}\n\n${prompt}`;
    }

    if (this.conversationTranscript.length > 0) {
      const recentContext = this.conversationTranscript
        .slice(-5)
        .map(turn => `${turn.speaker}: ${turn.message}`)
        .join('\n');
      
      prompt += `\n\nRecent conversation:\n${recentContext}`;
    }

    return prompt;
  }

  private async playAudioResponse(audioBuffer: Buffer): Promise<void> {
    try {
      const base64Audio = audioBuffer.toString('base64');
      
      await this.page.evaluate((audioData) => {
        const audio = new Audio(`data:audio/mp3;base64,${audioData}`);
        audio.play().catch(err => console.error('[Browser] Audio playback error:', err));
      }, base64Audio);

      console.log('[Audio] AI response played back to browser');
    } catch (error) {
      console.error('[Audio] Failed to play audio response:', error);
    }
  }

  private async saveToRecording(audioChunk: Buffer, format: 'webm' | 'mp3'): Promise<void> {
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

    this.isProcessing = false;

    await this.page.evaluate(() => {
      if ((window as any).mediaRecorder && (window as any).mediaRecorder.state !== 'inactive') {
        (window as any).mediaRecorder.stop();
      }
    }).catch(err => console.error('[Audio] Error stopping browser recording:', err));

    console.log('[Audio] Waiting for final chunks (4 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 4000));

    await this.page.evaluate(() => {
      if ((window as any).audioWebSocket) {
        (window as any).audioWebSocket.close();
      }
    }).catch(err => console.error('[Audio] Error closing browser WebSocket:', err));

    console.log('[Audio] WebSocket closed, waiting for queued chunks (2 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.isAcceptingChunks = false;

    console.log(`[Audio] Draining audio queue (${this.audioQueue.length} chunks remaining)`);
    
    if (!this.processingQueue && this.audioQueue.length > 0) {
      await this.processAudioQueue();
    }

    const maxWaitTime = 30000;
    const startTime = Date.now();
    
    while ((this.processingQueue || this.audioQueue.length > 0) && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.audioQueue.length > 0) {
      console.warn(`[Audio] Queue drain timeout - ${this.audioQueue.length} chunks abandoned`);
    } else {
      console.log('[Audio] Audio queue drained successfully');
    }
  }

  async cleanup(): Promise<string> {
    console.log(`[Audio] Cleaning up resources for call ${this.callId}`);

    await this.stopCapture();

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
