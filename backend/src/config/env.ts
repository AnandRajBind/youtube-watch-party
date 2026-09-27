import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env file safely from current working directory or backend root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
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
  MONGODB_URI: z.string().optional(),
  MONGO_URI: z.string().optional(),
  CLIENT_URL: z
    .string()
    .default('http://localhost:5173')
    .transform((val) => val.trim().replace(/\/+$/, ''))
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

// Resolve MongoDB connection string from either MONGODB_URI or MONGO_URI
const resolvedMongoUri =
  parsedEnv.data.MONGODB_URI ||
  parsedEnv.data.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URI;

if (!resolvedMongoUri) {
  console.error('❌ Invalid environment variables:');
  console.error(' - MONGODB_URI (or MONGO_URI): required for database persistence');
  process.exit(1);
}

export const env = {
  PORT: parsedEnv.data.PORT,
  NODE_ENV: parsedEnv.data.NODE_ENV,
  MONGODB_URI: resolvedMongoUri,
  MONGO_URI: resolvedMongoUri,
  CLIENT_URL: parsedEnv.data.CLIENT_URL,
};

export type Env = typeof env;
