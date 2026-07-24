import { cleanupScenarios } from "./_cleanup-scenarios.mjs";
import { getSupportedExecutors, normalizeScenarios } from "./_executor-config.mjs";
import { graphScenarios } from "./_graph-scenarios.mjs";

const rawScenarios = {
  ...cleanupScenarios,
  ...graphScenarios
};

export const scenarios = normalizeScenarios(rawScenarios);

export const scenarioIds = Object.keys(scenarios);

export const scenarioMatrix = scenarioIds.flatMap((scenarioId) =>
  scenarios[scenarioId].includeInMatrix === false
    ? []
    : getSupportedExecutors(scenarios[scenarioId]).map((executor) => ({
        scenario: scenarioId,
        executor,
        jobName: `${executor} / ${scenarioId}`
      }))
);

export const graphScenarioMatrix = scenarioIds.flatMap((scenarioId) =>
  scenarios[scenarioId].includeInGraphMatrix === true
    ? getSupportedExecutors(scenarios[scenarioId]).map((executor) => ({
        scenario: scenarioId,
        executor,
        jobName: `${executor} / ${scenarioId}`
      }))
    : []
);
