import { defineConfig } from "drizzle-kit"
import dotenv from "dotenv"
dotenv.config()

// Enable SSL for remote databases (e.g. Aiven) but not for a local Docker
// instance, which doesn't support SSL. Mirrors src/db/index.ts.
const isLocalHost = ["localhost", "127.0.0.1"].includes(
  process.env.DB_HOST || ""
)
const useSsl =
  process.env.DB_SSL !== undefined
    ? process.env.DB_SSL === "true"
    : !isLocalHost

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  },
})
