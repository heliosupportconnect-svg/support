import { NextResponse } from 'next/server'
import type { CarouselSlide } from '@prisma/client'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { prepareCarouselImage } from '@/lib/carousel-image'
import { parseDashboardSlidePayload } from '@/lib/dashboard-slide-input'
import { deleteDashboardObject, replaceDashboardObject } from '@/lib/dashboard-storage-lifecycle'
import { prisma } from '@/lib/prisma'
import { createSignedObjectUrl, createStorageKey, DASHBOARD_IMAGES_BUCKET, deleteObject, uploadObject, verifyObjectExists } from '@/lib/object-storage'

async function safeSlide(slide: CarouselSlide) {
  return { id: slide.id, title: slide.title, shortTitle: slide.subtitle ?? slide.title, image: slide.storageKey ? await createSignedObjectUrl(DASHBOARD_IMAGES_BUCKET, slide.storageKey) : slide.imageUrl, updated: slide.updatedAt.toISOString(), duration: 3, active: slide.isActive, storageKey: slide.storageKey ?? undefined }
}
async function requireEditor() { const admin = await getCurrentAdmin(); return admin && (admin.account.role === 'PRINCIPAL' || admin.account.role === 'DIRECTOR') ? admin : null }

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireEditor()) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  const { id } = await context.params
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Invalid update.' }, { status: 400 }) }
  const file = form.get('image')
  const payload = parseDashboardSlidePayload(form.get('payload'))
  if (!payload) return NextResponse.json({ error: 'Invalid update.' }, { status: 400 })
  let slide: CarouselSlide
  let cleanupPending = false
  try {
    const existing = await prisma.carouselSlide.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Slide not found.' }, { status: 404 })
    const replacementFile = file instanceof File ? file : null
    if (file !== null && !replacementFile) return NextResponse.json({ error: 'Invalid image.' }, { status: 400 })
    if (replacementFile && (!['image/jpeg', 'image/png'].includes(replacementFile.type) || replacementFile.size > 5 * 1024 * 1024)) {
      return NextResponse.json({ error: 'Image must be JPEG or PNG under 5 MB.' }, { status: 400 })
    }

    const storageKey = replacementFile ? createStorageKey('slides', replacementFile.name) : existing.storageKey
    const preparedImage = replacementFile ? await prepareCarouselImage(replacementFile) : null
    const updateRecord = () => prisma.$transaction(async (tx) => {
      const nextOrder = typeof payload.order === 'number' ? payload.order : null
      let targetOrder = existing.order
      if (nextOrder !== null) {
        const allSlides = await tx.carouselSlide.findMany({ orderBy: { order: 'asc' } })
        const currentIndex = allSlides.findIndex((candidate) => candidate.id === id)
        if (currentIndex === -1) throw new Error('Slide not found.')
        const reordered = [...allSlides]
        const [moved] = reordered.splice(currentIndex, 1)
        targetOrder = Math.max(0, Math.min(nextOrder, reordered.length))
        reordered.splice(targetOrder, 0, moved)
        await Promise.all(reordered.map((candidate, index) => tx.carouselSlide.update({
          where: { id: candidate.id },
          data: { order: index },
        })))
      }

      return tx.carouselSlide.update({
        where: { id },
        data: {
          title: typeof payload.title === 'string' ? payload.title.trim() : existing.title,
          subtitle: typeof payload.shortTitle === 'string' ? payload.shortTitle.trim() : existing.subtitle,
          isActive: typeof payload.active === 'boolean' ? payload.active : existing.isActive,
          order: targetOrder,
          storageKey,
          imageUrl: replacementFile ? null : existing.imageUrl,
        },
      })
    })

    if (replacementFile && preparedImage && storageKey) {
      const lifecycle = await replaceDashboardObject({
        uploadNew: () => uploadObject(DASHBOARD_IMAGES_BUCKET, storageKey, preparedImage.body, preparedImage.contentType),
        verifyNew: () => verifyObjectExists(DASHBOARD_IMAGES_BUCKET, storageKey),
        updateRecord,
        cleanupNew: async () => {
          const current = await prisma.carouselSlide.findUnique({ where: { id }, select: { storageKey: true } })
          if (current?.storageKey !== storageKey) await deleteObject(DASHBOARD_IMAGES_BUCKET, storageKey)
        },
        cleanupOld: () => existing.storageKey ? deleteObject(DASHBOARD_IMAGES_BUCKET, existing.storageKey) : Promise.resolve(),
        onCleanupFailure: (stage, error) => console.error('[DashboardSlideCleanup]', {
          slideId: id,
          stage,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      })
      slide = lifecycle.record
      cleanupPending = lifecycle.cleanupPending
    } else {
      slide = await updateRecord()
    }
  } catch {
    return NextResponse.json({ error: 'Unable to update dashboard update.' }, { status: 503 })
  }

  try {
    return NextResponse.json({ slide: await safeSlide(slide), ...(cleanupPending ? { cleanupPending: true } : {}) })
  } catch {
    return NextResponse.json({ error: 'Dashboard update saved, but its image URL could not be generated.' }, { status: 503 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireEditor()) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  const { id } = await context.params
  try {
    const existing = await prisma.carouselSlide.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Slide not found.' }, { status: 404 })

    const result = await deleteDashboardObject({
      deleteRecord: () => prisma.carouselSlide.delete({ where: { id } }),
      deleteObject: () => existing.storageKey ? deleteObject(DASHBOARD_IMAGES_BUCKET, existing.storageKey) : Promise.resolve(),
      onCleanupFailure: (error) => console.error('[DashboardSlideCleanup]', {
        slideId: id,
        stage: 'delete-object',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }),
    })
    return NextResponse.json({ ok: true, ...(result.cleanupPending ? { cleanupPending: true } : {}) })
  } catch {
    return NextResponse.json({ error: 'Unable to delete dashboard update.' }, { status: 503 })
  }
}
