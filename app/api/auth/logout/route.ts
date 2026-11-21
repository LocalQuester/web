import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '../../../../lib/api-url';

export async function POST(request: NextRequest) {
  const token = (await cookies()).get('lq_session')?.value;
  const apiUrl = getApiUrl();
  if (token && apiUrl) {
    await fetch(new URL('/auth/logout', apiUrl), {
      signal: AbortSignal.timeout(3000),
      method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
    }).catch(() => null);
  }
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('lq_session');
  return response;
}
