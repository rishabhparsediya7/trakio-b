import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
const { Pool } = pg

import * as schema from "./schema"
import dotenv from "dotenv"

dotenv.config()

// Enable SSL for remote databases (e.g. managed Postgres) but not for a
// local Docker instance, which doesn't support SSL. Defaults based on host,
// with an explicit DB_SSL override (true/false).
const isLocalHost = ["localhost", "127.0.0.1"].includes(
  process.env.DB_HOST || ""
)
const useSsl =
  process.env.DB_SSL !== undefined
    ? process.env.DB_SSL === "true"
    : !isLocalHost

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
})

// Create Drizzle instance with schema
export const db = drizzle(pool, { schema })

// Export types
export type DB = typeof db
export { schema }
