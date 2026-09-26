type ReplacementSteps<T> = {
  uploadNew: () => Promise<void>
  verifyNew: () => Promise<void>
  updateRecord: () => Promise<T>
  cleanupNew: () => Promise<void>
  cleanupOld: () => Promise<void>
  onCleanupFailure: (stage: 'new-object' | 'old-object', error: unknown) => void
}

type DeleteSteps<T> = {
  deleteRecord: () => Promise<T>
  deleteObject: () => Promise<void>
  onCleanupFailure: (error: unknown) => void
}

async function tryCleanup(cleanup: () => Promise<void>, report: (error: unknown) => void): Promise<boolean> {
  try {
    await cleanup()
    return true
  } catch (error) {
    try { report(error) } catch {}
    return false
  }
}

export async function replaceDashboardObject<T>(steps: ReplacementSteps<T>): Promise<{ record: T; cleanupPending: boolean }> {
  try {
    await steps.uploadNew()
    await steps.verifyNew()
  } catch (error) {
    await tryCleanup(steps.cleanupNew, (cleanupError) => steps.onCleanupFailure('new-object', cleanupError))
    throw error
  }

  let record: T
  try {
    record = await steps.updateRecord()
  } catch (error) {
    await tryCleanup(steps.cleanupNew, (cleanupError) => steps.onCleanupFailure('new-object', cleanupError))
    throw error
  }

  const oldObjectRemoved = await tryCleanup(steps.cleanupOld, (cleanupError) => steps.onCleanupFailure('old-object', cleanupError))
  return { record, cleanupPending: !oldObjectRemoved }
}

export async function deleteDashboardObject<T>(steps: DeleteSteps<T>): Promise<{ record: T; cleanupPending: boolean }> {
  const record = await steps.deleteRecord()
  const objectRemoved = await tryCleanup(steps.deleteObject, steps.onCleanupFailure)
  return { record, cleanupPending: !objectRemoved }
}