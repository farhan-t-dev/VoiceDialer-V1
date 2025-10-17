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

  async transcodeToWav(inputBuffer: Buffer, sourceFormat: 'webm' | 'mp3'): Promise<string> {
    await this.ensureTempDir();

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
