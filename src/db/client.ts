import { SQL } from "bun";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export const sql = new SQL({
  url: process.env.DATABASE_URL || "postgres://localhost:5432/vcr",
});

export async function runMigrations() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
  const files = ["001_init.sql", "002_remove_codex.sql", "003_add_last_attempt_at.sql"];

  for (const file of files) {
    const [existing] = await sql`SELECT name FROM _migrations WHERE name = ${file}`;
    if (existing) continue;

    const content = readFileSync(join(dir, file), "utf-8");
    await sql.unsafe(content);
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    console.log(`Applied migration: ${file}`);
  }
}
