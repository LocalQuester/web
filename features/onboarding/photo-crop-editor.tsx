'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { CtaButton } from '../../components/ui/cta-button';
import { cropGeometry, zoomCropAt, type PhotoSize, type PhotoPan } from './photo-crop';
import styles from './profile-photo.module.css';

export type PhotoCandidate = PhotoSize & { src: string };
type CropView = { zoom: number; pan: PhotoPan };
const initialView: CropView = { zoom: 1, pan: { x: 0, y: 0 } };

export function PhotoCropEditor({ candidate, busy, onCancel, onSave }: {
  candidate: PhotoCandidate; busy: boolean; onCancel: () => void;
  onSave: (crop: { x: number; y: number; size: number }) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(402);
  const [view, setView] = useState(initialView);
  const currentView = useRef(initialView);
  const pointers = useRef(new Map<number, PhotoPan>());
  const geometry = cropGeometry(candidate, frameWidth, view.zoom, view.pan);

  const updateView = useCallback((next: CropView) => {
    const bounded = { zoom: next.zoom, pan: cropGeometry(candidate, frameWidth, next.zoom, next.pan).pan };
    currentView.current = bounded;
    setView(bounded);
  }, [candidate, frameWidth]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setFrameWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      if (busy || !element) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const nextZoom = currentView.current.zoom * Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.002);
      updateView(zoomCropAt(candidate, frameWidth, currentView.current, nextZoom, anchor));
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [busy, candidate, frameWidth, updateView]);

  function point(event: PointerEvent<HTMLDivElement>): PhotoPan {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || busy) return;
    const before = Array.from(pointers.current.values());
    const next = point(event);
    pointers.current.set(event.pointerId, next);
    const after = Array.from(pointers.current.values());
    const current = currentView.current;
    if (before.length === 2) {
      const distance = (pair: PhotoPan[]) => Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
      const midpoint = (pair: PhotoPan[]) => ({ x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 });
      const oldDistance = distance(before);
      if (oldDistance < 1) return;
      updateView(zoomCropAt(candidate, frameWidth, current, current.zoom * distance(after) / oldDistance, midpoint(before), midpoint(after)));
    } else {
      updateView({ zoom: current.zoom, pan: { x: current.pan.x + next.x - previous.x, y: current.pan.y + next.y - previous.y } });
    }
  }

  function endPointer(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }

  return <>
    <header className={styles.header}>
      <button type="button" className={styles.back} aria-label="사진 자르기 취소" disabled={busy} onClick={onCancel}>
        <Image src="/figma/profile-photo/back.svg" alt="" width={28} height={28} unoptimized />
      </button>
    </header>
    <div className={styles.cropContent}>
      <div ref={frame} className={styles.cropFrame} tabIndex={busy ? -1 : 0} role="group" aria-label="사진 위치와 크기 조정" aria-describedby="photo-crop-hint"
        onKeyDown={event => {
          if (busy) return;
          const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
          const current = currentView.current;
          if (delta) {
            event.preventDefault();
            updateView({ zoom: current.zoom, pan: { x: current.pan.x + delta[0], y: current.pan.y + delta[1] } });
          } else if (['+', '=', '-', '_'].includes(event.key)) {
            event.preventDefault();
            const anchor = { x: frameWidth / 2, y: geometry.circleTop + geometry.diameter / 2 };
            updateView(zoomCropAt(candidate, frameWidth, current, current.zoom * (['+', '='].includes(event.key) ? 1.1 : 1 / 1.1), anchor));
          }
        }} style={{ height: geometry.frameHeight }}
        onPointerDown={event => {
          if (busy || pointers.current.size >= 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, point(event));
        }}
        onPointerMove={move} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}>
        <Image src={candidate.src} alt="자를 사진 미리보기" width={candidate.width} height={candidate.height} unoptimized draggable={false}
          className={styles.cropImage} style={{ width: geometry.width, height: geometry.height, left: geometry.left, top: geometry.top }} />
        <div className={styles.cropMask} style={{ width: geometry.diameter, height: geometry.diameter, top: geometry.circleTop, left: geometry.circleLeft }} />
      </div>
      <p id="photo-crop-hint" className={styles.keyboardHint}>드래그나 방향키로 사진을 이동하고, 마우스 휠, 두 손가락 또는 +, - 키로 확대하거나 축소할 수 있어요.</p>
    </div>
    <div className={styles.cropCta}><CtaButton disabled={busy} onClick={() => onSave(geometry.source)}>{busy ? '처리 중' : '완료'}</CtaButton></div>
  </>;
}
