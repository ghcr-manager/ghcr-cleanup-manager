export function isDigestTag (tag: string): boolean {
  return tag.startsWith('sha256-') && tag.length >= 71 && !_containsNonHex(tag.slice(7, 71))
}

export function digestFromDigestTag (tag: string): string | null {
  if (!isDigestTag(tag)) {
    return null
  }

  return `sha256:${tag.slice(7, 71)}`
}

function _containsNonHex (value: string): boolean {
  return /[^0-9A-Fa-f]/.test(value)
}
