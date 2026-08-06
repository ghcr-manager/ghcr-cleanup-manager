export interface HttpErrorResponse {
  status: number
  headers: Headers
  json: () => Promise<unknown>
}

export async function buildHttpErrorMessage (response: HttpErrorResponse, fallback: string): Promise<string> {
  const details: string[] = [fallback, `status ${response.status}`]
  const body = await _readJsonErrorBody(response)
  const message = typeof body?.message === 'string' ? body.message : undefined
  const documentationUrl = typeof body?.documentation_url === 'string' ? body.documentation_url : undefined
  const authenticateHeader = response.headers.get('www-authenticate') ?? undefined

  if (message) {
    details.push(message)
  }
  if (documentationUrl) {
    details.push(documentationUrl)
  }
  if (authenticateHeader) {
    details.push(`www-authenticate: ${authenticateHeader}`)
  }

  return details.join(' - ')
}

async function _readJsonErrorBody (response: HttpErrorResponse): Promise<
| {
  message?: unknown
  documentation_url?: unknown
}
| undefined
> {
  const contentType = response.headers.get('content-type')?.split(';')[0]
  if (contentType && contentType !== 'application/json' && !contentType.endsWith('+json')) {
    return undefined
  }

  try {
    const body = await response.json()
    if (body && typeof body === 'object') {
      return body as { message?: unknown, documentation_url?: unknown }
    }
  } catch {
    return undefined
  }

  return undefined
}
