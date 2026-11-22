export type PhotoSize = { width: number; height: number };
export type PhotoPan = { x: number; y: number };

export function cropGeometry(image: PhotoSize, frameWidth: number, zoom: number, pan: PhotoPan) {
  const frameHeight = frameWidth * 540 / 402;
  const diameter = frameWidth * 399 / 402;
  const circleTop = frameWidth * 16 / 402;
  const circleLeft = (frameWidth - diameter) / 2;
  const scale = Math.max(frameWidth / image.width, frameHeight / image.height) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const left = Math.min(circleLeft, Math.max(circleLeft + diameter - width, (frameWidth - width) / 2 + pan.x));
  const top = Math.min(circleTop, Math.max(circleTop + diameter - height, (frameHeight - height) / 2 + pan.y));
  return {
    width, height, left, top, diameter, circleTop, circleLeft, frameHeight,
    pan: { x: left - (frameWidth - width) / 2, y: top - (frameHeight - height) / 2 },
    source: { x: (circleLeft - left) / scale, y: (circleTop - top) / scale, size: diameter / scale },
  };
}

export function minimumCropZoom(image: PhotoSize, frameWidth: number) {
  const diameter = frameWidth * 399 / 402;
  const baseScale = Math.max(frameWidth / image.width, (frameWidth * 540 / 402) / image.height);
  // 편집 영역 전체가 아닌 실제 원형 선택 영역을 채우는 배율까지 축소합니다.
  return diameter / Math.min(image.width, image.height) / baseScale;
}
export function zoomCropAt(
  image: PhotoSize, frameWidth: number, current: { zoom: number; pan: PhotoPan },
  requestedZoom: number, anchor: PhotoPan, nextAnchor: PhotoPan = anchor,
) {
  const zoom = Math.max(minimumCropZoom(image, frameWidth), Math.min(3, requestedZoom));
  const before = cropGeometry(image, frameWidth, current.zoom, current.pan);
  const ratio = zoom / current.zoom;
  const left = nextAnchor.x - (anchor.x - before.left) * ratio;
  const top = nextAnchor.y - (anchor.y - before.top) * ratio;
  const pan = {
    x: left - (frameWidth - before.width * ratio) / 2,
    y: top - (before.frameHeight - before.height * ratio) / 2,
  };
  return { zoom, pan: cropGeometry(image, frameWidth, zoom, pan).pan };
}
export function loadPhoto(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('Empty image'));
    image.onerror = () => reject(new Error('Invalid image'));
    image.src = src;
  });
}

export async function renderCroppedPhoto(src: string, crop: { x: number; y: number; size: number }): Promise<File> {
  const image = await loadPhoto(src);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 512, 512);
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, 512, 512);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image encoding failed')), 'image/jpeg', 0.9));
  return new File([blob], 'profile.jpg', { type: 'image/jpeg' });
}
