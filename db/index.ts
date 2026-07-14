import { drizzle } from "drizzle-orm/d1";
import { getWorkerBinding } from "../app/lib/env";
import * as schema from "./schema";

export function getDb() {
  const database = getWorkerBinding<D1Database>("DB");
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(database, { schema });
}

export function hasDbBinding(): boolean {
  return Boolean(getWorkerBinding<D1Database>("DB"));
}
