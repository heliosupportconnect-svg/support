import { NextResponse } from 'next/server'
import type { CarouselSlide } from '@prisma/client'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { createSignedObjectUrl, createStorageKey, DASHBOARD_IMAGES_BUCKET, deleteObject, uploadObject } from '@/lib/object-storage'

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
  const payload = JSON.parse(typeof form.get('payload') === 'string' ? String(form.get('payload')) : '{}') as Record<string, unknown>
  let uploadedStorageKey: string | null = null
  try {
    const existing = await prisma.carouselSlide.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Slide not found.' }, { status: 404 })
    let storageKey = existing.storageKey
    let imageUrl = existing.imageUrl
    if (file instanceof File) {
      if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Image must be JPEG or PNG under 5 MB.' }, { status: 400 })
      storageKey = createStorageKey('slides', file.name)
      uploadedStorageKey = storageKey
      await uploadObject(DASHBOARD_IMAGES_BUCKET, storageKey, Buffer.from(await file.arrayBuffer()), file.type)
      imageUrl = null
    }
    const slide = await prisma.carouselSlide.update({
      where: { id },
      data: {
        title: typeof payload.title === 'string' ? payload.title.trim() : existing.title,
        subtitle: typeof payload.shortTitle === 'string' ? payload.shortTitle.trim() : existing.subtitle,
        isActive: typeof payload.active === 'boolean' ? payload.active : existing.isActive,
        order: typeof payload.order === 'number' ? payload.order : existing.order,
        storageKey,
        imageUrl,
      },
    })
    if (file instanceof File && existing.storageKey) await deleteObject(DASHBOARD_IMAGES_BUCKET, existing.storageKey).catch(() => undefined)
    return NextResponse.json({ slide: await safeSlide(slide) })
  } catch {
    if (uploadedStorageKey) await deleteObject(DASHBOARD_IMAGES_BUCKET, uploadedStorageKey).catch(() => undefined)
    return NextResponse.json({ error: 'Unable to update dashboard update.' }, { status: 503 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireEditor()) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  const { id } = await context.params
  try {
    const existing = await prisma.carouselSlide.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Slide not found.' }, { status: 404 })
    await prisma.carouselSlide.delete({ where: { id } })
    if (existing.storageKey) await deleteObject(DASHBOARD_IMAGES_BUCKET, existing.storageKey).catch(() => undefined)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unable to delete dashboard update.' }, { status: 503 })
  }
}
