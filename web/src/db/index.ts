import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

/**
 * One pooled client per process. Next dev reloads modules on every edit, so
 * the client is cached on globalThis to avoid leaking connections — a hosted
 * Postgres will refuse new ones long before you notice locally.
 */
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
// Each serverless instance opens its own pool, so this multiplies by the
// number of warm instances. Keep it small and point DATABASE_URL at a pooler
// (Supabase port 6543, Neon's pooled host) rather than raising it.
const max = Number(process.env.DATABASE_POOL_MAX ?? 3);
const sql = g.__sql ?? postgres(url, { max });
if (process.env.NODE_ENV !== "production") g.__sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
