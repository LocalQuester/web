import Image from 'next/image';
import styles from './profile-photo.module.css';

export function ProfileAvatar({ src }: { src?: string }) {
  return <div className={styles.avatar}>
    {src ? <Image className={styles.selectedPhoto} src={src} alt="선택한 프로필 사진" width={236} height={236} loading="eager" unoptimized /> : <>
      <Image src="/figma/profile-photo/avatar-background.svg" alt="" width={236} height={236} loading="eager" unoptimized />
      <Image className={styles.person} src="/figma/profile-photo/avatar-person.svg" alt="기본 프로필 사진" width={140} height={140} loading="eager" unoptimized />
    </>}
  </div>;
}
