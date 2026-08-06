export type CleanupHistoryRelation = 'source-ahead' | 'target-ahead' | 'diverged'

export function resolveCleanupHistoryRelation (
  sourceCleanupUuids: string[],
  targetCleanupUuids: string[]
): CleanupHistoryRelation {
  if (_isPrefix(targetCleanupUuids, sourceCleanupUuids)) {
    return 'source-ahead'
  }
  if (_isPrefix(sourceCleanupUuids, targetCleanupUuids)) {
    return 'target-ahead'
  }
  return 'diverged'
}

function _isPrefix (prefixCandidate: string[], history: string[]): boolean {
  if (prefixCandidate.length > history.length) {
    return false
  }

  return prefixCandidate.every((cleanupUuid, index) => cleanupUuid === history[index])
}
