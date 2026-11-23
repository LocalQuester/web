import Image from 'next/image';
import { BottomNav } from '../../components/ui/bottom-nav';

export default function NavPreview() {
  return <div className="mobile-shell" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Image src="/figma/wordmark.svg" alt="LOCAL QUESTER" width={306} height={33} priority unoptimized style={{ maxWidth: '100%', height: 'auto' }} />
      <p style={{ marginTop: 16, color: '#6b7c72', fontSize: 14, textAlign: 'center' }}>하단 네비게이션 미리보기</p>
    </main>
    <BottomNav previewActive="home" />
  </div>;
}