'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import { CtaButton } from '../../components/ui/cta-button';
import { useProfileDraft } from './profile-draft-provider';
import { ProfileAvatar } from './profile-avatar';
import styles from './profile-photo.module.css';

const decorations = [
  { id: '465:4312', asset: 'bottom-dot.svg', className: 'bottomDot', size: 4, x: -11, y: -9, time: 0.6625, opacity: 0.78 },
  { id: '465:4319', asset: 'ring.svg', className: 'ring', size: 9, x: -13, y: -12, time: 0.6094, opacity: 0.78 },
  { id: '465:4320', asset: 'top-dot.svg', className: 'topDot', size: 4, x: 11, y: 15, time: 0.5313, opacity: 0.78 },
  { id: '465:4321', asset: 'star.svg', className: 'star', size: 22.2369, x: 17, y: 13, time: 0.4531, opacity: 0.82 },
];

function WelcomeDecorations() {
  const reduceMotion = useReducedMotion();
  return decorations.map(item => {
    const movement: Transition = { duration: 3.2, times: [0, item.time, 1], ease: 'easeOut', repeat: Infinity };
    return <motion.div key={item.id} data-node-id={item.id} aria-hidden="true" className={`${styles.decoration} ${styles[item.className]}`}
      style={{ transformOrigin: '50% 50%' }}
      initial={reduceMotion ? false : { opacity: 0, x: item.x, y: item.y, ...(item.className === 'star' ? { rotate: 18 } : {}) }}
      animate={reduceMotion ? { opacity: 1, x: 0, y: 0, rotate: 0 } : { opacity: [0, 1, 0.62, item.opacity], x: [item.x, 0, 0], y: [item.y, 0, 0], ...(item.className === 'star' ? { rotate: [18, 0, 0] } : {}) }}
      transition={reduceMotion ? { duration: 0 } : {
        opacity: { duration: 3.2, times: [0, item.time, 0.8125, 1], ease: ['easeOut', 'easeInOut', 'easeInOut'], repeat: Infinity },
        x: movement, y: movement, ...(item.className === 'star' ? { rotate: movement } : {}),
      }}>
      <Image src={`/figma/profile-photo/${item.asset}`} alt="" width={item.size} height={item.size} unoptimized />
    </motion.div>;
  });
}

export function ProfileCompleteScreen() {
  const { nickname, photo } = useProfileDraft();
  const router = useRouter();
  return <main className={`mobile-shell ${styles.completeScreen}`}>
    <section className={styles.welcome}>
      <h1>환영합니다!</h1>
      <p>나만의 LOCAL QUESTER를 만나보세요</p>
    </section>
    <div className={styles.welcomeProfile}>
      <ProfileAvatar src={photo?.url} />
      <p className={styles.nickname}>{nickname}</p>
      <WelcomeDecorations />
    </div>
    <div className={styles.completeFooter}>
      <CtaButton className={styles.start} onClick={() => router.push('/home')}>
        <span>시작하기</span>
        <Image src="/figma/profile-photo/start-arrow.svg" alt="" width={28} height={28} unoptimized />
      </CtaButton>
    </div>
  </main>;
}
