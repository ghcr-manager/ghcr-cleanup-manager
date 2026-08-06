export function buildInClausePlaceholders (valueCount: number): string {
  if (valueCount <= 0) {
    throw new Error('valueCount must be greater than 0')
  }

  return Array.from({ length: valueCount }, () => '?').join(', ')
}

export function buildTuplePlaceholders (rowCount: number, columnCount: number): string {
  if (rowCount <= 0) {
    throw new Error('rowCount must be greater than 0')
  }
  if (columnCount <= 0) {
    throw new Error('columnCount must be greater than 0')
  }

  const tuple = `(${Array.from({ length: columnCount }, () => '?').join(', ')})`
  return Array.from({ length: rowCount }, () => tuple).join(', ')
}
