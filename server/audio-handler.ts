import { Page } from 'playwright';
import WebSocket, { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

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
  private recordingStream: fs.WriteStream | null = null;
  private conversationTranscript: ConversationTurn[] = [];
  private isProcessing: boolean = false;
  private callId: string;

  constructor(page: Page, config: AudioStreamConfig, callId: string) {
    this.page = page;
    this.config = config;
    this.callId = callId;
  }

  async startAudioCapture(): Promise<void> {
    try {
      console.log(`[Audio] Starting audio capture for call ${this.callId}`);

      await this.setupAudioWebSocket();
      
      await this.injectAudioCaptureScript();

      this.isProcessing = true;

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
      this.wsServer = new WebSocketServer({ port: wsPort });
      
      this.wsServer.on('listening', async () => {
        console.log(`[WebSocket] Server listening on port ${wsPort}`);
        
        try {
          await this.page.evaluate((port) => {
            (window as any).audioWebSocket = new WebSocket(`ws://localhost:${port}`);
            
            (window as any).audioWebSocket.onopen = () => {
              console.log('[Browser] Connected to audio WebSocket server');
            };

            (window as any).audioWebSocket.onerror = (error: any) => {
              console.error('[Browser] WebSocket error:', error);
            };
          }, wsPort);

          setTimeout(() => resolve(), 1000);
        } catch (error) {
          reject(error);
        }
      });

      this.wsServer.on('connection', (ws: WebSocket) => {
        console.log('[WebSocket] Audio WebSocket connected');
        this.wsConnection = ws;

        ws.on('message', async (message: string) => {
          try {
            const data = JSON.parse(message);
            
            if (data.type === 'audio' && data.data) {
              const audioBuffer = Buffer.from(data.data, 'base64');
              await this.processWithElevenLabs(audioBuffer);
              
              this.conversationTranscript.push({
                speaker: 'contact',
                message: '[Contact Audio Captured]',
                timestamp: new Date(),
              });
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
        reject(error);
      });
    });
  }

  private async processWithElevenLabs(audioChunk: Buffer): Promise<void> {
    if (!this.isProcessing) return;

    try {
      console.log(`[ElevenLabs] Processing audio chunk (${audioChunk.length} bytes)`);

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
        
        await this.saveToRecording(audioChunk);
        await this.saveToRecording(aiAudioBuffer);

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

  private async saveToRecording(audioChunk: Buffer): Promise<void> {
    try {
      const recordingDir = path.join(process.cwd(), 'recordings');
      
      if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
      }

      const recordingPath = path.join(recordingDir, `${this.callId}.mp3`);
      
      if (!this.recordingStream) {
        this.recordingStream = fs.createWriteStream(recordingPath, { flags: 'a' });
        console.log(`[Recording] Started recording to ${recordingPath}`);
      }
      
      this.recordingStream.write(audioChunk);
    } catch (error) {
      console.error('[Recording] Failed to save recording:', error);
    }
  }

  public getTranscript(): ConversationTurn[] {
    return this.conversationTranscript;
  }

  public getRecordingPath(): string {
    return path.join(process.cwd(), 'recordings', `${this.callId}.mp3`);
  }

  async stopCapture(): Promise<void> {
    console.log(`[Audio] Stopping audio capture for call ${this.callId}`);
    
    this.isProcessing = false;

    await this.page.evaluate(() => {
      if ((window as any).mediaRecorder && (window as any).mediaRecorder.state !== 'inactive') {
        (window as any).mediaRecorder.stop();
      }
      if ((window as any).audioWebSocket) {
        (window as any).audioWebSocket.close();
      }
    }).catch(err => console.error('[Audio] Error stopping browser recording:', err));
  }

  async cleanup(): Promise<void> {
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

    if (this.recordingStream) {
      this.recordingStream.end();
      this.recordingStream = null;
      console.log(`[Recording] Recording saved for call ${this.callId}`);
    }

    console.log(`[Audio] Cleanup completed for call ${this.callId}`);
  }
}
