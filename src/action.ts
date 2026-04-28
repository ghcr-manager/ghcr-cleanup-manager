import { main } from "./cli.js";

async function _run(): Promise<void> {
  const command = process.env.INPUT_COMMAND;
  const databasePath = process.env.INPUT_DB_PATH;
  const snapshotPath = process.env.INPUT_SNAPSHOT;
  const source = process.env.INPUT_SOURCE;
  const owner = process.env.INPUT_OWNER;
  const packageName = process.env.INPUT_PACKAGE;
  const token = process.env.INPUT_TOKEN;
  const olderThanDays = process.env.INPUT_OLDER_THAN_DAYS;
  const deleteUntagged = process.env.INPUT_DELETE_UNTAGGED === "true";
  const excludeTags = (process.env.INPUT_EXCLUDE_TAGS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (!command) {
    throw new Error("missing action input: command");
  }

  const argv = [command];
  if (databasePath) {
    argv.push("--db", databasePath);
  }
  if (snapshotPath) {
    argv.push("--snapshot", snapshotPath);
  }
  if (source) {
    argv.push("--source", source);
  }
  if (owner) {
    argv.push("--owner", owner);
  }
  if (packageName) {
    argv.push("--package", packageName);
  }
  if (token) {
    argv.push("--token", token);
  }
  if (olderThanDays) {
    argv.push("--older-than-days", olderThanDays);
  }
  if (deleteUntagged) {
    argv.push("--delete-untagged");
  }
  for (const tag of excludeTags) {
    argv.push("--exclude-tag", tag);
  }

  const exitCode = await main(argv);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

_run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
