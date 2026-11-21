import Link from 'next/link';
import Image from 'next/image';

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="mobile-shell login-screen">
    <section className="login-brand" aria-label="Local Quester">
      <Image className="brand-wordmark" src="/figma/wordmark.svg" alt="LOCAL QUESTER" width={306} height={33} loading="eager" unoptimized />
      <p>지도 위에서 발견하는 새로운 혜택</p>
    </section>
    <section className="login-actions" aria-label="소셜 로그인">
      <div className="login-buttons">
        <Link className="login-button kakao" href="/api/auth/start/kakao">
          <Image src="/figma/kakao.svg" alt="" width={24} height={24} unoptimized /><span>카카오로 시작하기</span>
        </Link>
        <Link className="login-button google" href="/api/auth/start/google">
          <Image src="/figma/google.png" alt="" width={24} height={24} unoptimized /><span>Google로 시작하기</span>
        </Link>
      </div>
      {error && <p className="login-error" role="alert">로그인을 시작하거나 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
      <p className="login-terms">회원가입 시 LOCAL QUESTER의<br />개인정보 처리방침 및 이용약관에 동의하게 됩니다</p>
    </section>
  </main>;
}
