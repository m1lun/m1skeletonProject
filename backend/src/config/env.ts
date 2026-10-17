import 'dotenv/config';

const rawPort = process.env.PORT;
const port =
  rawPort === undefined || rawPort === ''
    ? 3000
    : Number.parseInt(rawPort, 10);

if (Number.isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${rawPort}`);
}

function required(name: string, raw: string | undefined): string {
  const value = raw?.trim();
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const mongoDb = process.env.MONGODB_DB?.trim();

export const env = {
  port,
  mongoUri: required('MONGODB_URI', process.env.MONGODB_URI),
  mongoDb: mongoDb === undefined || mongoDb === '' ? 'matchmarket' : mongoDb,
} as const;
