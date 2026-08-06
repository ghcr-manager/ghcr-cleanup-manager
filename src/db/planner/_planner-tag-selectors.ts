import type Database from 'better-sqlite3'

export interface PlannerTagSelectorPredicate {
  sql: string
  params: string[]
}

export function buildTagSelectorPredicate (
  database: Database.Database,
  columnSql: string,
  selectors: string[],
  useRegex: boolean
): PlannerTagSelectorPredicate {
  if (selectors.length === 0) {
    throw new Error('selectors must not be empty')
  }

  if (useRegex) {
    registerRegexFunction(database)
  }

  return {
    sql: selectors
      .map((selector) => {
        if (useRegex) {
          return `regexp(?, ${columnSql})`
        }

        return hasWildcard(selector) ? `${columnSql} LIKE ? ESCAPE '\\'` : `${columnSql} = ?`
      })
      .join(' OR '),
    params: useRegex ? selectors : selectors.map((selector) => wildcardSelectorToSqlLike(selector))
  }
}

export function wildcardSelectorToSqlLike (selector: string): string {
  if (!hasWildcard(selector)) {
    return selector
  }

  return selector.replaceAll(/[%_\\*?]/g, (character) => {
    switch (character) {
      case '%':
      case '_':
      case '\\':
        return `\\${character}`
      case '*':
        return '%'
      case '?':
        return '_'
      default:
        return character
    }
  })
}

export function hasWildcard (selector: string): boolean {
  return selector.includes('*') || selector.includes('?')
}

function registerRegexFunction (database: Database.Database): void {
  const markedDatabase = database as Database.Database & {
    __ghcrManagerRegexCache?: Map<string, RegExp>
    __ghcrManagerRegexRegistered?: boolean
  }
  if (markedDatabase.__ghcrManagerRegexRegistered) {
    return
  }

  markedDatabase.__ghcrManagerRegexCache = new Map()
  database.function('regexp', (pattern: string, value: string) => {
    let compiled = markedDatabase.__ghcrManagerRegexCache?.get(pattern)
    if (!compiled) {
      compiled = new RegExp(pattern)
      markedDatabase.__ghcrManagerRegexCache?.set(pattern, compiled)
    }

    return compiled.test(value) ? 1 : 0
  })
  markedDatabase.__ghcrManagerRegexRegistered = true
}
