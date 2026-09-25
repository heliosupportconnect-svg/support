export type AdminQueueRole = 'VP_PRIMARY' | 'VP_SECONDARY' | 'PRINCIPAL' | 'DIRECTOR'

export function normalizeStudentClass(value: string): string | null {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'LKG' || normalized === 'UKG') return normalized
  const match = normalized.match(/^(?:CLASS\s*)?(10|[1-9])$/)
  return match ? `Class ${Number(match[1])}` : null
}

export function normalizeStudentSection(value: string): string | null {
  const match = value.trim().match(/^(?:SECTION\s*)?([AB])$/i)
  return match ? `Section ${match[1].toUpperCase()}` : null
}

export function getQueueForStudentClass(className: string): 'VP_PRIMARY' | 'VP_SECONDARY' | null {
  const normalized = normalizeStudentClass(className)
  const match = normalized?.match(/^Class (\d+)$/)
  if (!match) return null
  const classNumber = Number(match[1])
  return classNumber >= 1 && classNumber <= 5 ? 'VP_PRIMARY' : classNumber <= 10 ? 'VP_SECONDARY' : null
}

export function validateEscalationMutation(
  role: string,
  currentStatus: string,
  currentTargets: unknown,
  body: Record<string, unknown>,
): 400 | 403 | null {
  const hasTargets = Object.prototype.hasOwnProperty.call(body, 'escalatedTo')
  const hasEscalatedAt = Object.prototype.hasOwnProperty.call(body, 'escalatedAt')
  if (!hasTargets && !hasEscalatedAt) return null
  if (role !== 'VP_PRIMARY' && role !== 'VP_SECONDARY') return 403
  if (currentStatus === 'RESOLVED' || currentStatus === 'CLOSED' || (Array.isArray(currentTargets) && currentTargets.length > 0)) return 403

  if (!hasTargets || !hasEscalatedAt || body.status !== 'IN_PROGRESS') return 400
  if (typeof body.escalatedAt !== 'string' || !Number.isFinite(Date.parse(body.escalatedAt))) return 400
  if (!Array.isArray(body.escalatedTo) || !body.escalatedTo.every((target) => target === 'PRINCIPAL' || target === 'DIRECTOR')) return 400

  const targets = body.escalatedTo as string[]
  const uniqueTargets = new Set(targets)
  if (uniqueTargets.size !== targets.length || targets.length < 1 || targets.length > 2) return 400
  return null
}