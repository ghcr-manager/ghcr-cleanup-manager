import type Database from "better-sqlite3";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function initializeSchema(database: Database.Database): void {
  _initializeSqlDirectory(database, "schema");
  _initializeSqlDirectory(database, "views");
}

function _initializeSqlDirectory(database: Database.Database, directoryName: string): void {
  const sqlDirectory = join(process.cwd(), "resources", "sql", directoryName);
  if (!existsSync(sqlDirectory)) {
    return;
  }

  const sqlFiles = readdirSync(sqlDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const sqlFile of sqlFiles) {
    const sql = readFileSync(join(sqlDirectory, sqlFile), "utf8");
    database.exec(sql);
  }
}
