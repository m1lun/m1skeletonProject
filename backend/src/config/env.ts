import 'dotenv/config';

const rawPort = process.env.PORT;
const port =
  rawPort === undefined || rawPort === ''
    ? 3000
    : Number.parseInt(rawPort, 10);

if (Number.isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${rawPort}`);
}

function optional(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value === undefined || value === '' ? undefined : value;
}

export const env = {
  port,
  // MongoDB connection string; required once the server wires up the store.
  mongoUri: optional(process.env.MONGODB_URI),
  mongoDb: optional(process.env.MONGODB_DB) ?? 'matchmarket',
} as const;
