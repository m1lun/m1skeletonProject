import 'dotenv/config';

const rawPort = process.env.PORT;
const port =
  rawPort === undefined || rawPort === ''
    ? 3000
    : Number.parseInt(rawPort, 10);

if (Number.isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${rawPort}`);
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

export const env = {
  port,
  // When unset the server runs against an in-memory store (dev only).
  mongoUri: optional('MONGODB_URI'),
  mongoDb: optional('MONGODB_DB') ?? 'matchmarket',
} as const;
