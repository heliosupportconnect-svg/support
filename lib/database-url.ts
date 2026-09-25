import { isIP } from 'node:net'

function isValidHostname(hostname: string): boolean {
  const unwrapped = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  if (isIP(unwrapped) !== 0) return true

  const domain = unwrapped.endsWith('.') ? unwrapped.slice(0, -1) : unwrapped
  if (!domain || domain.length > 253) return false
  return domain.split('.').every((label) =>
    label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  )
}

export function validateDatabaseUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error('DATABASE_URL is required to initialize the database client.')

  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.')
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.')
  }
  if (!parsed.hostname || !isValidHostname(parsed.hostname)) throw new Error('DATABASE_URL must include a valid hostname.')

  if (parsed.port) {
    const port = Number(parsed.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('DATABASE_URL must include a valid PostgreSQL port.')
    }
  }
  if (parsed.port === '0') throw new Error('DATABASE_URL must include a valid PostgreSQL port.')

  let databaseName: string
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1))
  } catch {
    throw new Error('DATABASE_URL must include a valid database path.')
  }
  if (!databaseName.trim()) throw new Error('DATABASE_URL must include a database path.')

  return value.trim()
}