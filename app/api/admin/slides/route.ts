import { NextResponse } from 'next/server'
import type { CarouselSlide } from '@prisma/client'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { createSignedObjectUrl, createStorageKey, DASHBOARD_IMAGES_BUCKET, deleteObject, uploadObject } from '@/lib/object-storage'

async function safeSlide(slide: CarouselSlide) {
  return {
    id: slide.id,
    title: slide.title,
    shortTitle: slide.subtitle ?? slide.title,
    image: slide.storageKey ? await createSignedObjectUrl(DASHBOARD_IMAGES_BUCKET, slide.storageKey) : slide.imageUrl,
    updated: slide.updatedAt.toISOString(),
    duration: 3,
    active: slide.isActive,
    storageKey: slide.storageKey ?? undefined,
  }
}

async function requireEditor() {
  const admin = await getCurrentAdmin()
  return admin && (admin.account.role === 'PRINCIPAL' || admin.account.role === 'DIRECTOR') ? admin : null
}

export async function GET() {
  try {
    const admin = await getCurrentAdmin()
    const slides = await prisma.carouselSlide.findMany({
      where: admin ? undefined : { isActive: true },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json({ slides: await Promise.all(slides.map(safeSlide)) })
  } catch {
    return NextResponse.json({ error: 'Unable to load dashboard updates from Neon.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  if (!await requireEditor()) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 }) }
  const file = form.get('image')
  const title = typeof form.get('title') === 'string' ? String(form.get('title')).trim() : ''
  const position = Number(form.get('position') ?? 999)
  if (!(file instanceof File) || !['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024 || !title) {
    return NextResponse.json({ error: 'A JPEG or PNG image under 5 MB and a title are required.' }, { status: 400 })
  }

  const storageKey = createStorageKey('slides', file.name)
  try {
    await uploadObject(DASHBOARD_IMAGES_BUCKET, storageKey, Buffer.from(await file.arrayBuffer()), file.type)
    const slide = await prisma.carouselSlide.create({
      data: {
        title,
        subtitle: title,
        storageKey,
        imageUrl: null,
        order: Number.isFinite(position) ? position : 999,
      },
    })
    return NextResponse.json({ slide: await safeSlide(slide) }, { status: 201 })
  } catch {
    await deleteObject(DASHBOARD_IMAGES_BUCKET, storageKey).catch(() => undefined)
    return NextResponse.json({ error: 'Unable to save dashboard update to Neon/object storage.' }, { status: 503 })
  }
}
