#!/usr/bin/env node

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const _scriptDirectory = dirname(fileURLToPath(import.meta.url));
const _workspaceDirectory = resolve(_scriptDirectory, "..");
const _sourceDirectory = resolve(_workspaceDirectory, "public");
const _targetDirectory = resolve(_workspaceDirectory, "dist", "public");
const _cytoscapeSourcePath = resolve(
  _workspaceDirectory,
  "..",
  "node_modules",
  "cytoscape",
  "dist",
  "cytoscape.esm.min.mjs"
);
const _vendorDirectory = resolve(_targetDirectory, "vendor");

rmSync(_targetDirectory, { recursive: true, force: true });
mkdirSync(resolve(_workspaceDirectory, "dist"), { recursive: true });
cpSync(_sourceDirectory, _targetDirectory, { recursive: true });
mkdirSync(_vendorDirectory, { recursive: true });
cpSync(_cytoscapeSourcePath, resolve(_vendorDirectory, "cytoscape.js"));
