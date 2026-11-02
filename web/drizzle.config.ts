import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so it does not pick up .env.local the way the
// app does. Load it here or every db: script fails on an undefined DATABASE_URL.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Fine when the file is absent (CI) or Node is too old for loadEnvFile;
  // DATABASE_URL may already be set in the environment.
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
