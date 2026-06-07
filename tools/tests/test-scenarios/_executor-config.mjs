function _replaceTagTokens(value, tagNames, scenarioId) {
  if (typeof value !== "string") {
    return value;
  }

  return value.replaceAll(/\{([a-zA-Z0-9]+)\}/g, (_match, key) => {
    if (!(key in tagNames)) {
      throw new Error(`unknown tag token '${key}' in scenario '${scenarioId}'`);
    }
    return tagNames[key];
  });
}

export function getSupportedExecutors(scenario) {
  return scenario.supportedExecutors;
}

function _normalizeGhcrManagerConfig(scenario) {
  if (!scenario.ghcrManager?.inputs) {
    throw new Error(`scenario '${scenario.id}' is missing ghcrManager.inputs`);
  }

  return scenario.ghcrManager;
}

function _normalizeSupportedExecutors(scenario) {
  if (!scenario.supportedExecutors?.length) {
    throw new Error(`scenario '${scenario.id}' is missing supportedExecutors`);
  }

  return scenario.supportedExecutors;
}

export function normalizeScenarios(rawScenarios) {
  return Object.fromEntries(
    Object.entries(rawScenarios).map(([scenarioId, scenario]) => [
      scenarioId,
      {
        ...scenario,
        ghcrManager: _normalizeGhcrManagerConfig(scenario),
        supportedExecutors: _normalizeSupportedExecutors(scenario)
      }
    ])
  );
}

export function resolveExecutorConfig(scenario, executor, tagNames) {
  if (!scenario.supportedExecutors.includes(executor)) {
    throw new Error(`scenario '${scenario.id}' does not support executor '${executor}'`);
  }

  return {
    type: "action-inputs",
    inputs: Object.fromEntries(
      Object.entries(scenario.ghcrManager.inputs).map(([key, value]) => [
        key,
        _replaceTagTokens(value, tagNames, scenario.id)
      ])
    )
  };
}
