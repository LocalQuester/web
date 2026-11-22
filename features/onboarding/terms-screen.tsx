'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CtaButton } from '../../components/ui/cta-button';
import { useConsents } from './consent-provider';
import { allRequiredAccepted, terms } from './terms';
import styles from './terms.module.css';

export function TermsScreen() {
  const { consents, setConsent, setAll } = useConsents();
  const router = useRouter();
  const allChecked = terms.every(term => consents[term.id]);

  return <main className={`mobile-shell ${styles.screen}`}>
    <header className={styles.header}>
      <Link className={styles.iconButton} href="/login" aria-label="로그인 화면으로 돌아가기">
        <Image src="/figma/terms/back.svg" alt="" width={28} height={28} unoptimized />
      </Link>
    </header>
    <section className={styles.content} aria-labelledby="terms-title">
      <h1 id="terms-title" className={styles.title}>이용약관 동의</h1>
      <label className={styles.allConsent}>
        <input className={styles.checkbox} type="checkbox" checked={allChecked} onChange={event => setAll(event.target.checked)} />
        <Image src={`/figma/terms/check-${allChecked ? 'on' : 'off'}-all.svg`} alt="" width={24.0163} height={24.0163} unoptimized />
        <span>약관 전체 동의</span>
      </label>
      <p className={styles.caption}>LOCAL QUESTER 이용약관</p>
      <div className={styles.list}>
        {terms.map(term => <div key={term.id} className={styles.row}>
          <label className={styles.termLabel}>
            <input className={styles.checkbox} type="checkbox" checked={consents[term.id]} onChange={event => setConsent(term.id, event.target.checked)} />
            <Image src={`/figma/terms/check-${consents[term.id] ? 'on' : 'off'}.svg`} alt="" width={24} height={24} unoptimized />
            <span>[{term.required ? '필수' : '선택'}] {term.title}</span>
          </label>
          <Link href={`/onboarding/terms/${term.id}`} className={styles.iconButton} aria-label={`${term.detailTitle} 상세 보기`}>
            <Image className={styles.forward} src="/figma/terms/chevron.svg" alt="" width={28} height={28} unoptimized />
          </Link>
        </div>)}
      </div>
    </section>
    <div className={styles.cta}>
      <CtaButton disabled={!allRequiredAccepted(consents)} onClick={() => router.push('/onboarding/nickname')}>다음</CtaButton>
    </div>
  </main>;
}
