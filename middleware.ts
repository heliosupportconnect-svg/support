import { NextResponse, type NextRequest } from 'next/server'

const protectedPaths: string[] = []

function isProtectedPath(pathname: string): boolean {
  return protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}
export async function middleware(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const sessionToken = request.cookies.get('helios_session')?.value

  if (!sessionToken) {
    return redirectToLogin(request)
  }

  // Authenticated page requests use the same database-backed check as server APIs.
  // The auth API is excluded from this matcher, so this does not recurse.
  try {
    const validationUrl = new URL('/api/auth/me', request.url)
    const response = await fetch(validationUrl, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    })
    const result: unknown = await response.json()

    if (
      !isAuthenticatedResponse(result)
    ) {
      return redirectToLogin(request)
    }
  } catch {
    return redirectToLogin(request)
  }

  return NextResponse.next()
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

function isAuthenticatedResponse(
  value: unknown,
): value is { authenticated: true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'authenticated' in value &&
    value.authenticated === true
  )
}

