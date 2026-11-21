import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'kakao') return new NextResponse(null, { status: 404 });
  const apiUrl = process.env.API_URL;
  if (!apiUrl) return NextResponse.redirect(new URL('/login?error=unavailable', request.url));
  return NextResponse.redirect(new URL(`/auth/${provider}/start`, apiUrl));
}
