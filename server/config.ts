import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Google Voice
  GOOGLE_VOICE_EMAIL: z.string().email('GOOGLE_VOICE_EMAIL must be a valid email'),
  GOOGLE_VOICE_PASSWORD: z.string().min(1, 'GOOGLE_VOICE_PASSWORD is required'),
  
  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().min(1, 'ELEVENLABS_API_KEY is required'),
  
  // Virtual Audio Cable (optional with defaults)
  VAC_CAPTURE_DEVICE: z.string().optional(),
  VAC_PLAYBACK_DEVICE: z.string().optional(),
  VAC_BROWSER_OUTPUT: z.string().optional(),
  VAC_BROWSER_INPUT: z.string().optional(),
  
  // Session
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters for security'),
  
  // Server
  PORT: z.string().optional().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    const validated = envSchema.parse(process.env);
    console.log('✅ Environment variables validated successfully');
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\nPlease check your .env file and ensure all required variables are set.');
      console.error('See .env.example for reference.\n');
      process.exit(1);
    }
    throw error;
  }
}
