import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  const token = (await cookies()).get('lq_session')?.value;
  const apiUrl = process.env.API_URL;
  if (!token || !apiUrl) redirect('/login');
  const result = await fetch(new URL('/auth/me', apiUrl), {
    headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
  }).catch(() => null);
  if (!result?.ok) redirect('/login');
  const { user } = await result.json() as { user: { displayName: string | null } };
  return <main className="mobile-shell home-screen">
    <h1>{user.displayName ? `${user.displayName}님, 환영합니다` : 'Local Quester에 오신 것을 환영합니다'}</h1>
    <p>주변 퀘스트를 준비하고 있습니다.</p>
    <form action="/api/auth/logout" method="post"><button type="submit">로그아웃</button></form>
  </main>;
}
