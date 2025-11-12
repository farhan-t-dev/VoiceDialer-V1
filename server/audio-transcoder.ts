import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export class AudioTranscoder {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp_audio');
  }

  async ensureTempDir(): Promise<void> {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  /**
   * Convert raw PCM audio buffer to WAV format
   * @param pcmBuffer Int16 PCM audio data
   * @param sampleRate Sample rate (e.g., 16000)
   * @param channels Number of channels (1 for mono, 2 for stereo)
   * @returns WAV file buffer
   */
  pcmToWav(pcmBuffer: Buffer, sampleRate: number = 16000, channels: number = 1): Buffer {
    const dataSize = pcmBuffer.length;
    const headerSize = 44;
    const wavBuffer = Buffer.alloc(headerSize + dataSize);
    
    // WAV header
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(36 + dataSize, 4);
    wavBuffer.write('WAVE', 8);
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    wavBuffer.writeUInt16LE(channels, 22); // NumChannels
    wavBuffer.writeUInt32LE(sampleRate, 24); // SampleRate
    wavBuffer.writeUInt32LE(sampleRate * channels * 2, 28); // ByteRate
    wavBuffer.writeUInt16LE(channels * 2, 32); // BlockAlign
    wavBuffer.writeUInt16LE(16, 34); // BitsPerSample
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(dataSize, 40);
    
    // Copy PCM data
    pcmBuffer.copy(wavBuffer, headerSize);
    
    return wavBuffer;
  }

  /**
   * Save raw PCM buffer as WAV file
   */
  async savePcmAsWav(pcmBuffer: Buffer, sampleRate: number = 16000, channels: number = 1): Promise<string> {
    await this.ensureTempDir();
    
    const wavBuffer = this.pcmToWav(pcmBuffer, sampleRate, channels);
    const outputId = randomUUID();
    const outputPath = path.join(this.tempDir, `pcm_${outputId}.wav`);
    
    await fs.writeFile(outputPath, wavBuffer);
    return outputPath;
  }

  async transcodeToWav(inputBuffer: Buffer, sourceFormat: 'webm' | 'mp3' | 'pcm'): Promise<string> {
    await this.ensureTempDir();

    // PCM format doesn't need ffmpeg conversion - just add WAV header
    if (sourceFormat === 'pcm') {
      return await this.savePcmAsWav(inputBuffer, 16000, 1);
    }

    // For webm and mp3, use ffmpeg
    const inputId = randomUUID();
    const inputPath = path.join(this.tempDir, `input_${inputId}.${sourceFormat}`);
    const outputPath = path.join(this.tempDir, `output_${inputId}.wav`);

    try {
      await fs.writeFile(inputPath, inputBuffer);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .toFormat('wav')
          .audioCodec('pcm_s16le')
          .audioChannels(1)
          .audioFrequency(16000)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .save(outputPath);
      });

      return outputPath;
    } finally {
      try {
        await fs.unlink(inputPath);
      } catch (error) {
        console.error('[Transcoder] Failed to clean up input file:', error);
      }
    }
  }

  async concatenateWavFiles(wavPaths: string[], outputPath: string): Promise<void> {
    if (wavPaths.length === 0) {
      throw new Error('No WAV files to concatenate');
    }

    if (wavPaths.length === 1) {
      await fs.copyFile(wavPaths[0], outputPath);
      return;
    }

    const command = ffmpeg();

    for (const wavPath of wavPaths) {
      command.input(wavPath);
    }

    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .mergeToFile(outputPath, this.tempDir);
    });
  }

  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('[Transcoder] Failed to clean up temp file:', filePath, error);
    }
  }

  async cleanupTempFiles(filePaths: string[]): Promise<void> {
    await Promise.all(filePaths.map(fp => this.cleanupTempFile(fp)));
  }
}
