import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiUrl = process.env.API_URL;
  const ticket = request.nextUrl.searchParams.get('ticket');
  if (!apiUrl || !ticket) return NextResponse.redirect(new URL('/login?error=callback', request.url));
  try {
    const exchange = await fetch(new URL('/auth/exchange', apiUrl), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket }), cache: 'no-store',
    });
    if (!exchange.ok) throw new Error('ticket exchange failed');
    const session = await exchange.json() as { token: string; expiresAt: string };
    const response = NextResponse.redirect(new URL('/home', request.url));
    response.cookies.set('lq_session', session.token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: '/', expires: new Date(session.expiresAt),
    });
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }
}
