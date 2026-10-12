import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function stripPort(host: string): string {
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end >= 0 ? host.slice(0, end + 1) : host;
  }
  const i = host.lastIndexOf(':');
  return i >= 0 ? host.slice(0, i) : host;
}

function isStaging(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  if (host.endsWith('.up.railway.app')) return true;
  const extra = process.env.STAGING_HOSTS || '';
  return extra
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(host);
}

export function proxy(request: NextRequest) {
  const host = stripPort((request.headers.get('host') || '').toLowerCase());
  const { pathname } = request.nextUrl;

  if (isStaging(host)) {
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/images/badges/') ||
    pathname === '/icon.svg' ||
    pathname === '/favicon.ico' ||
    pathname === '/zoho-domain-verification.html' ||
    pathname.startsWith('/opengraph-image') ||
    pathname.startsWith('/twitter-image') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/launching', request.url));
  }

  // Redirect to the visitor's own domain: request.url carries the internal server address behind Railway's proxy.
  return NextResponse.redirect(`https://${host}/`, 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
