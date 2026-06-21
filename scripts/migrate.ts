import { readFileSync } from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";

// Простой раннер миграций для Neon (HTTP-драйвер @neondatabase/serverless).
// Рассчитан на простой DDL: без `$$`-блоков, функций, триггеров и прочего,
// где `;` может встречаться внутри тела statement. HTTP-драйвер выполняет
// одно statement за вызов, поэтому SQL-файл разбивается по `;` на границе
// строк, комментарии и пустые строки отфильтровываются, каждый statement
// выполняется по очереди через sql.query(stmt).

const DEFAULT_MIGRATION = "migrations/001_initial.sql";

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((stmt) =>
      stmt
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((stmt) => stmt.length > 0);
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL_UNPOOLED / DATABASE_URL is not set");
  }

  const fileArg = process.argv[2] || DEFAULT_MIGRATION;
  const filePath = path.resolve(process.cwd(), fileArg);
  const content = readFileSync(filePath, "utf8");
  const statements = splitStatements(content);

  const sql = neon(databaseUrl);

  console.log(`Applying ${statements.length} statement(s) from ${fileArg}`);
  for (const stmt of statements) {
    await sql.query(stmt);
  }
  console.log(`Migration complete: ${statements.length} statement(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
