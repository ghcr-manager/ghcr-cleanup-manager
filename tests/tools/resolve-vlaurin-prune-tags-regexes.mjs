#!/usr/bin/env node
/* global process */

const deleteTags = process.argv[2] ?? "";
const useRegex = process.argv[3] ?? "";

if (!deleteTags) {
  process.stdout.write("");
  process.exit(0);
}

const patterns = deleteTags
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => (useRegex === "true" ? value : _wildcardToRegex(value)));

process.stdout.write(patterns.join("\n"));

function _wildcardToRegex(pattern) {
  return `^${pattern.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`;
}
