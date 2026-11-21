'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Splash() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => router.replace('/login'), 1400);
    return () => window.clearTimeout(timer);
  }, [router]);

  return <main className="mobile-shell splash-screen" aria-label="Local Quester 시작 화면">
    <div className="splash-brand">
      <Image className="brand-pin" src="/figma/pin.svg" alt="" width={55} height={74} loading="eager" unoptimized />
      <Image className="brand-wordmark" src="/figma/wordmark.svg" alt="LOCAL QUESTER" width={306} height={33} loading="eager" unoptimized />
    </div>
  </main>;
}
