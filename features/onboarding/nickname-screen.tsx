'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CtaButton } from '../../components/ui/cta-button';
import { useProfileDraft } from './profile-draft-provider';
import { isDemoNicknameTaken } from './nickname-demo';
import { limitNickname, nicknameCharacters, validateNickname } from './nickname-validation';
import styles from './nickname.module.css';

const messages = {
  empty: '한글, 영어, 숫자 포함 2~10자까지 가능해요.',
  'too-short': '× 두 글자 이상 입력해주세요.',
  'too-long': '× 열 글자까지 입력할 수 있어요.',
  'invalid-characters': '× 공백 없이 한글, 영문, 숫자만 가능해요.',
  'unavailable-word': '× 부적절하거나 사용할 수 없는 단어가 포함되어 있어요.',
  duplicate: '× 이미 사용 중인 닉네임이에요.',
  valid: '✓ 사용 가능한 닉네임이에요.',
};

export function NicknameScreen() {
  const { nickname, setNickname } = useProfileDraft();
  const router = useRouter();
  const [isComposing, setIsComposing] = useState(false);
  const validation = validateNickname(nickname);
  const status = validation === 'valid' && isDemoNicknameTaken(nickname) ? 'duplicate' : validation;
  const canContinue = status === 'valid' && !isComposing;
  const isError = status !== 'empty' && status !== 'valid' && !isComposing;

  function completeInput(input: HTMLInputElement) {
    const limited = limitNickname(input.value);
    // 같은 값으로 상태가 유지되어도 실제 입력창의 초과 문자를 즉시 제거합니다.
    if (input.value !== limited) input.value = limited;
    setNickname(limited);
  }

  return <main className={`mobile-shell ${styles.screen}`}>
    <header className={styles.header}>
      <Link className={styles.back} href="/onboarding/terms" aria-label="약관 동의 화면으로 돌아가기">
        <Image src="/figma/nickname/back.svg" alt="" width={28} height={28} unoptimized />
      </Link>
    </header>
    <form className={styles.form} onSubmit={event => {
      event.preventDefault();
      if (canContinue) router.push('/onboarding/profile-photo');
    }}>
      <section className={styles.content} aria-labelledby="nickname-title">
        <h1 id="nickname-title">사용할 닉네임을<br />입력해주세요.</h1>
        <div className={styles.fieldGroup}>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="text"
              name="nickname"
              aria-label="닉네임"
              placeholder="닉네임 입력"
              value={nickname}
              aria-describedby="nickname-message nickname-count"
              aria-invalid={isError}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={event => {
                completeInput(event.currentTarget);
              }}
              onCompositionStart={() => {
                setIsComposing(true);
              }}
              onCompositionEnd={event => {
                setIsComposing(false);
                completeInput(event.currentTarget);
              }}
            />
            <span id="nickname-count" className={styles.count}>{nicknameCharacters(nickname).length}/10</span>
          </div>
          <p id="nickname-message" className={`${styles.message} ${isError ? styles.error : canContinue ? styles.success : ''}`} aria-live="polite">
            {isComposing ? messages.empty : messages[status]}
          </p>
        </div>
      </section>
      <div className={styles.cta}><CtaButton type="submit" disabled={!canContinue}>다음</CtaButton></div>
    </form>
  </main>;
}
