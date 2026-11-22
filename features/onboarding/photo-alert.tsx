'use client';

import { useEffect, useRef } from 'react';
import styles from './profile-photo.module.css';

export type PhotoAlertKind = 'permission' | 'denied' | 'settings' | 'format' | 'size' | 'failed';

const content = {
  permission: { title: '사진 접근 허용', description: '사진 접근을 허용하시겠습니까?' },
  denied: { title: '권한 거부', description: '파일 권한이 거부되었어요.\n파일을 가져오려면 권한 허용이 필요해요.' },
  settings: { title: '사진 접근 설정 안내', description: '브라우저 또는 기기의 설정에서\n사진 및 파일 접근 권한을 확인한 뒤\n사진 선택을 다시 시도해 주세요.' },
  failed: { title: '업로드 실패', description: '파일 업로드에 실패했어요.\n잠시 후 다시 시도해 주세요.' },
  size: { title: '용량 초과', description: '파일 용량이 너무 커요.\n5MB 이하의 파일만 올릴 수 있어요.' },
  format: { title: '형식 오류', description: '올릴 수 없는 파일 형식이에요.\nJPG 또는 PNG 파일로 선택해 주세요.' },
};

export function PhotoAlert({ kind, onClose, onChoose, onSettings }: {
  kind: PhotoAlertKind; onClose: () => void; onChoose: () => void; onSettings: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const { title, description } = content[kind];
  return <dialog ref={dialog} className={styles.alert} aria-labelledby="photo-alert-title" aria-describedby="photo-alert-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={styles.alertContent}>
      <h2 id="photo-alert-title">{title}</h2>
      <p id="photo-alert-description">{description}</p>
    </div>
    <div className={styles.alertActions}>
      {kind === 'permission' ? <>
        <button type="button" onClick={onChoose}>예</button>
        <button type="button" onClick={onClose}>아니요</button>
      </> : kind === 'denied' ? <>
        <button type="button" onClick={onClose}>확인</button>
        <button type="button" onClick={onSettings}>설정으로</button>
      </> : <button type="button" onClick={onClose}>확인</button>}
    </div>
  </dialog>;
}
