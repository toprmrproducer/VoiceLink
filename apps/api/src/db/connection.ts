import { MongoClient, Db, IndexDescription } from "mongodb";
import { createLogger } from "../lib/logger.js";

const log = createLogger("db");

let client: MongoClient | null = null;
let db: Db | null = null;

const INDEXES: Record<string, IndexDescription[]> = {
  tenants: [
    { key: { "telephony.providerClientId": 1 }, unique: true, sparse: true },
    { key: { status: 1 } },
  ],
  users: [
    { key: { email: 1 }, unique: true },
    { key: { tenantId: 1 } },
  ],
  agents: [{ key: { tenantId: 1, status: 1 } }],
  campaigns: [{ key: { tenantId: 1, status: 1 } }],
  calls: [
    { key: { tenantId: 1, startedAt: -1 } },
    { key: { providerCallId: 1 }, unique: true, sparse: true },
    { key: { campaignId: 1 }, sparse: true },
  ],
  transcripts: [{ key: { callId: 1 }, unique: true }],
  recordings: [{ key: { callId: 1 } }],
  voice_clones: [{ key: { tenantId: 1 } }],
  credits: [{ key: { tenantId: 1 }, unique: true }],
  credits_ledger: [{ key: { tenantId: 1, createdAt: -1 } }],
  api_keys: [
    { key: { hash: 1 }, unique: true },
    { key: { tenantId: 1, kind: 1 } },
  ],
};

export async function connectDb(url: string, dbName?: string): Promise<Db> {
  if (db) return db;
  client = new MongoClient(url, { maxPoolSize: 20 });
  await client.connect();
  db = client.db(dbName);
  await ensureIndexes(db);
  log.info({ db: db.databaseName }, "mongo connected");
  return db;
}

export async function ensureIndexes(database: Db): Promise<void> {
  for (const [collection, indexes] of Object.entries(INDEXES)) {
    if (indexes.length === 0) continue;
    await database.collection(collection).createIndexes(indexes);
  }
}

export function getDb(): Db {
  if (!db) throw new Error("Database not connected. Call connectDb() first.");
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

// Test helper — wire a Db instance into module state (used by mongodb-memory-server tests).
export function setDbForTesting(testDb: Db, testClient?: MongoClient): void {
  db = testDb;
  if (testClient) client = testClient;
}
