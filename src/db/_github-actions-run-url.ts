export function resolveGitHubActionsRunUrl (env: NodeJS.ProcessEnv = process.env): string | null {
  const serverUrl = env.GITHUB_SERVER_URL
  const repository = env.GITHUB_REPOSITORY
  const runId = env.GITHUB_RUN_ID

  if (!serverUrl || !repository || !runId) {
    return null
  }

  return `${serverUrl}/${repository}/actions/runs/${runId}`
}
