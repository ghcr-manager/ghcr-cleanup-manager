import { collectRepeatedOption, requireOption } from './_args.js'
import { DbMergeRepository, openDatabase } from '../db/index.js'

export async function handleDbMerge (args: string[]): Promise<number> {
  const databasePath = requireOption(args, '--db')
  const sourceDatabasePaths = collectRepeatedOption(args, '--source-db')
  if (sourceDatabasePaths.length === 0) {
    throw new Error('missing required option: --source-db')
  }

  const targetDatabase = openDatabase(databasePath)
  try {
    const merger = new DbMergeRepository(targetDatabase)
    const summaries = []
    let importedScanCount = 0
    let skippedScanCount = 0
    let importedCleanupRunCount = 0
    let skippedCleanupRunCount = 0

    for (const sourceDatabasePath of sourceDatabasePaths) {
      const sourceDatabase = openDatabase(sourceDatabasePath)
      sourceDatabase.close()
      const summary = merger.mergeSourceDatabase(sourceDatabasePath)
      summaries.push(summary)
      importedScanCount += summary.importedScanCount
      skippedScanCount += summary.skippedScanCount
      importedCleanupRunCount += summary.importedCleanupRunCount
      skippedCleanupRunCount += summary.skippedCleanupRunCount
    }

    console.log(
      JSON.stringify(
        {
          targetDatabasePath: databasePath,
          sourceDatabaseCount: sourceDatabasePaths.length,
          importedScanCount,
          skippedScanCount,
          importedCleanupRunCount,
          skippedCleanupRunCount,
          sources: summaries
        },
        null,
        2
      )
    )
    return 0
  } finally {
    targetDatabase.close()
  }
}
