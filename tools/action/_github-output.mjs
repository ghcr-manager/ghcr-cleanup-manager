#!/usr/bin/env node
/* global process */

import { appendFileSync } from "node:fs";

export function writeGitHubOutputs(outputPath, outputs) {
  if (!outputPath) {
    return;
  }

  appendFileSync(
    outputPath,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    "utf8"
  );
}
