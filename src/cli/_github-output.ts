import { appendFileSync } from 'node:fs'

export interface GitHubScanOutputs {
  owner: string
  packageName: string
  scanCompletedAt: string
  packageVersions: number
  tags: number
  manifests: number
  manifestEdges: number
}

export function writeGitHubScanOutputs (outputPath: string, outputs: GitHubScanOutputs): void {
  const lines = [
    `owner=${outputs.owner}`,
    `package_name=${outputs.packageName}`,
    `scan_completed_at=${outputs.scanCompletedAt}`,
    `package_versions=${outputs.packageVersions}`,
    `tags=${outputs.tags}`,
    `manifests=${outputs.manifests}`,
    `manifest_edges=${outputs.manifestEdges}`
  ]

  appendFileSync(outputPath, `${lines.join('\n')}\n`)
}
