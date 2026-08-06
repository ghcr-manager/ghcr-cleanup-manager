import type { ScanRow } from './_planner-types.js'

interface LatestScanSql {
  get: <T>(sql: string, params: Array<number | string>) => T | undefined
}

export class PlannerLatestScan {
  readonly #sql: LatestScanSql

  constructor (sql: LatestScanSql) {
    this.#sql = sql
  }

  get (owner: string, packageName: string): ScanRow {
    const sql = `
      SELECT scan_id, owner, package_name, scan_completed_at
      FROM v_latest_scan_per_package
      WHERE owner = ?
        AND package_name = ?
      LIMIT 1
    `
    const row = this.#sql.get<ScanRow>(sql, [owner, packageName])
    if (row == null) {
      throw new Error(`database does not contain completed package scan for ${owner}/${packageName}`)
    }

    return row
  }
}
