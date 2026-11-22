'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CtaButton } from '../../components/ui/cta-button';
import { useProfileDraft } from './profile-draft-provider';
import { ProfileAvatar } from './profile-avatar';
import { PhotoAlert, type PhotoAlertKind } from './photo-alert';
import { PhotoCropEditor, type PhotoCandidate } from './photo-crop-editor';
import { loadPhoto, renderCroppedPhoto } from './photo-crop';
import { validatePhotoFile } from './photo-validation';
import styles from './profile-photo.module.css';

export function ProfilePhotoScreen() {
  const { photo, setPhoto } = useProfileDraft();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [alert, setAlert] = useState<PhotoAlertKind | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [candidate, setCandidate] = useState<PhotoCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => () => { if (candidate) URL.revokeObjectURL(candidate.src); }, [candidate]);

  function choosePhoto() {
    setAlert(null);
    setAccepted(true);
    try {
      input.current?.click();
    } catch (error) {
      setAlert(error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name) ? 'denied' : 'failed');
    }
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const id = ++request.current;
    setBusy(true);
    let src: string | null = null;
    try {
      const error = await validatePhotoFile(file);
      if (id !== request.current) return;
      if (error) { setAlert(error); return; }
      src = URL.createObjectURL(file);
      const image = await loadPhoto(src);
      if (id !== request.current) return;
      setCandidate({ src, width: image.naturalWidth, height: image.naturalHeight });
      src = null;
    } catch {
      if (id === request.current) setAlert('failed');
    } finally {
      if (src) URL.revokeObjectURL(src);
      if (id === request.current) setBusy(false);
    }
  }

  async function saveCrop(crop: { x: number; y: number; size: number }) {
    if (!candidate || busy) return;
    const id = ++request.current;
    setBusy(true);
    try {
      const file = await renderCroppedPhoto(candidate.src, crop);
      if (id !== request.current) return;
      setPhoto(file);
      setCandidate(null);
    } catch {
      if (id === request.current) setAlert('failed');
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  return <main className={`mobile-shell ${styles.screen} ${photo && !candidate ? styles.selectedScreen : ''}`} aria-busy={busy}>
    <input ref={input} className={styles.fileInput} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" aria-label="프로필 사진 파일 선택" tabIndex={-1} onChange={selectPhoto} />
    {candidate ? <PhotoCropEditor candidate={candidate} busy={busy} onCancel={() => setCandidate(null)} onSave={saveCrop} /> : <>
      <header className={styles.header}>
        {photo ? <button type="button" className={styles.back} aria-label="사진 선택 화면으로 돌아가기" disabled={busy} onClick={() => setPhoto(null)}>
          <Image src="/figma/profile-photo/back.svg" alt="" width={28} height={28} unoptimized />
        </button> : <Link className={styles.back} href="/onboarding/nickname" aria-label="닉네임 입력으로 돌아가기">
          <Image src="/figma/profile-photo/back.svg" alt="" width={28} height={28} unoptimized />
        </Link>}
      </header>
      <section className={styles.content} aria-labelledby={photo ? undefined : 'photo-title'} aria-label={photo ? '선택한 프로필 사진' : undefined}>
        {!photo && <h1 id="photo-title">프로필 사진을<br />등록해주세요.</h1>}
        <div className={styles.avatarWrap}>
          <ProfileAvatar src={photo?.url} />
          <button type="button" className={styles.camera} aria-label={photo ? '프로필 사진 변경' : '프로필 사진 선택'} disabled={busy} onClick={() => accepted ? choosePhoto() : setAlert('permission')}>
            <Image src="/figma/profile-photo/camera.svg" alt="" width={40} height={40} unoptimized />
          </button>
        </div>
        {busy && <p className={styles.processing} role="status">사진을 확인하고 있어요.</p>}
      </section>
      <div className={styles.footer}>
        <button type="button" className={styles.skip} disabled={busy} onClick={() => { setPhoto(null); router.push('/onboarding/complete'); }}>지금은 건너뛸래요</button>
        <CtaButton disabled={!photo || busy} onClick={() => router.push('/onboarding/complete')}>{photo ? '완료' : '다음'}</CtaButton>
      </div>
    </>}
    {alert && <PhotoAlert key={alert} kind={alert} onClose={() => setAlert(null)} onChoose={choosePhoto} onSettings={() => setAlert('settings')} />}
  </main>;
}
