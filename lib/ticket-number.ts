export function formatTicketNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Ticket number must be a positive integer.')
  }

  return `#HL-${String(value).padStart(6, '0')}`
}

export function formatTicketIdentifier(value: number): string {
  return formatTicketNumber(value).slice(1)
}

export function parseTicketNumber(value: string): number | null {
  let normalized: string
  try {
    normalized = decodeURIComponent(value).trim().toUpperCase()
  } catch {
    return null
  }
  const match = normalized.match(/^#?HL-(\d+)$/)
  if (!match) return null

  const ticketNumber = Number(match[1])
  return Number.isSafeInteger(ticketNumber) && ticketNumber > 0 ? ticketNumber : null
}

export function parseLegacyTicketNumber(value: string): string | null {
  let normalized: string
  try {
    normalized = decodeURIComponent(value).trim().toUpperCase()
  } catch {
    return null
  }

  return /^HEL-[A-Z0-9]+$/.test(normalized) ? normalized : null
}
