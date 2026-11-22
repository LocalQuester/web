'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CtaButton } from '../../components/ui/cta-button';
import { useConsents } from './consent-provider';
import { terms, type TermId } from './terms';
import styles from './terms.module.css';

export function TermDetail({ id }: { id: TermId }) {
  const term = terms.find(term => term.id === id)!;
  const { setConsent } = useConsents();
  const router = useRouter();
  const returnToTerms = () => router.replace('/onboarding/terms');

  return <main className={`mobile-shell ${styles.screen}`}>
    <header className={styles.header}>
      <button className={styles.iconButton} type="button" onClick={returnToTerms} aria-label="약관 동의 화면으로 돌아가기">
        <Image src="/figma/terms/back.svg" alt="" width={28} height={28} unoptimized />
      </button>
    </header>
    <article className={`${styles.content} ${styles.detail}`}>
      <h1 className={styles.title}>{term.detailTitle}</h1>
      <p className={styles.draftNotice}>확정 전 임시 문안입니다.</p>
      {[1, 2, 3, 4].map(number => <section key={number}>
        <h2>제{number}조 {number === 1 ? '목적' : '내용 안내'}</h2>
        <p>이 문서는 LOCAL QUESTER의 {term.detailTitle} 화면을 확인하기 위한 더미 텍스트입니다. 실제 서비스에 적용할 내용은 추후 확정된 문안으로 교체됩니다.</p>
        <p>서비스 이용에 필요한 안내 사항과 적용 범위 등 상세 내용을 이 영역에 표시합니다.</p>
      </section>)}
    </article>
    <div className={styles.cta}>
      <CtaButton onClick={() => {
        if (term.required) setConsent(term.id, true);
        returnToTerms();
      }}>{term.required ? '확인' : '닫기'}</CtaButton>
    </div>
  </main>;
}
