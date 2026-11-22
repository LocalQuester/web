import Link from 'next/link';

export default function NicknamePage() {
  return <main className="mobile-shell home-screen">
    <Link href="/onboarding/terms">약관 동의로 돌아가기</Link>
    <h1>닉네임 입력</h1>
    <p>프로필 설정에서 사용할 닉네임을 준비해 주세요.</p>
  </main>;
}
