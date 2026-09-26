import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env file from project root or backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
      message: 'PORT must be a valid port number between 1 and 65535',
    }),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  MONGO_URI: z
    .string({
      required_error: 'MONGO_URI is required for database persistence',
    })
    .min(1, 'MONGO_URI cannot be empty'),
  CLIENT_URL: z
    .string()
    .default('http://localhost:5173')
    .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
      message: 'CLIENT_URL must be a valid HTTP or HTTPS URL',
    }),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  parsedEnv.error.format();
  for (const [key, issues] of Object.entries(parsedEnv.error.flatten().fieldErrors)) {
    console.error(` - ${key}: ${issues?.join(', ')}`);
  }
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
