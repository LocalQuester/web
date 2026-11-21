import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const token = (await cookies()).get('lq_session')?.value;
  if (token && process.env.API_URL) {
    await fetch(new URL('/auth/logout', process.env.API_URL), {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
    }).catch(() => null);
  }
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('lq_session');
  return response;
}
