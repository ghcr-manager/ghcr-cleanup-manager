#!/usr/bin/env node
/* global process */

import { scenarioMatrix } from "./test-scenarios/_definitions.mjs";

process.stdout.write(JSON.stringify({ include: scenarioMatrix }));
