#!/usr/bin/env node

import { readFileSync } from "node:fs";
import YAML from "yaml";
import { scenarioIds } from "./test-scenarios/_definitions.mjs";

const workflow = YAML.parse(readFileSync(".github/workflows/test_scenario-executor.yml", "utf8"));
const workflowOn = workflow?.on;
const workflowDispatch = workflowOn?.workflow_dispatch ?? workflowOn?.["workflow_dispatch"];
const workflowOptions = workflowDispatch?.inputs?.scenario?.options;

if (JSON.stringify(workflowOptions) !== JSON.stringify(scenarioIds)) {
  throw new Error(
    `test_scenario-executor.yml scenario options do not match scenario definitions:\nexpected ${JSON.stringify(
      scenarioIds
    )}\nactual   ${JSON.stringify(workflowOptions)}`
  );
}
