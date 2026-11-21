import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { getApiUrl } from '../../../../../lib/api-url';

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'kakao') return new NextResponse(null, { status: 404 });
  const apiUrl = getApiUrl();
  if (!apiUrl) return NextResponse.redirect(new URL('/login?error=unavailable', request.url));
  const verifier = randomBytes(32).toString('base64url');
  const target = new URL(`/auth/${provider}/start`, apiUrl);
  target.searchParams.set('challenge', createHash('sha256').update(verifier).digest('hex'));
  const response = NextResponse.redirect(target);
  response.cookies.set('lq_login_verifier', verifier, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth', maxAge: 600 });
  return response;
}
