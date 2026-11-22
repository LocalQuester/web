'use client';

import Link from 'next/link';
import { useProfileDraft } from '../../../features/onboarding/profile-draft-provider';

export default function ProfilePhotoPage() {
  const { nickname } = useProfileDraft();
  return <main className="mobile-shell home-screen">
    <Link href="/onboarding/nickname">닉네임 입력으로 돌아가기</Link>
    <h1>프로필 사진 선택</h1>
    {nickname && <p>{nickname}님의 프로필 사진</p>}
  </main>;
}
