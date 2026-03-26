import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api'];

const BACKEND_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Proxy /api/* requests to the backend at runtime
  if (pathname.startsWith('/api')) {
    const url = new URL(pathname + request.nextUrl.search, BACKEND_URL);
    return NextResponse.rewrite(url, {
      request: { headers: request.headers },
    });
  }

  // Allow public paths (login page)
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for access_token cookie
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Token exists — allow through (actual validation happens server-side)
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
