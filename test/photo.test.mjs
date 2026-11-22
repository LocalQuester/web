import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePhotoFile, PROFILE_PHOTO_MAX_BYTES } from '../features/onboarding/photo-validation.ts';
import { cropGeometry, minimumCropZoom, zoomCropAt } from '../features/onboarding/photo-crop.ts';

test('JPG와 PNG 시그니처를 확인하고 위장 파일과 잘못된 형식을 거부한다', async () => {
  assert.equal(await validatePhotoFile(new File([new Uint8Array([255, 216, 255, 224])], 'a.jpg', { type: 'image/jpeg' })), null);
  assert.equal(await validatePhotoFile(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'a.png', { type: 'image/png' })), null);
  assert.equal(await validatePhotoFile(new File(['not an image'], 'a.jpg', { type: 'image/jpeg' })), 'format');
  assert.equal(await validatePhotoFile(new File([new Uint8Array([255, 216, 255])], 'a.gif', { type: 'image/gif' })), 'format');
  assert.equal(await validatePhotoFile(new File([], 'empty.png')), 'format');
});

test('5MB까지 허용하고 초과 파일은 거부한다', async () => {
  const bytes = new Uint8Array(PROFILE_PHOTO_MAX_BYTES);
  bytes.set([255, 216, 255]);
  assert.equal(await validatePhotoFile(new File([bytes], 'a.jpg', { type: 'image/jpeg' })), null);
  assert.equal(await validatePhotoFile(new File([bytes, 'x'], 'a.jpg', { type: 'image/jpeg' })), 'size');
});

test('사진 비율과 확대 및 이동에 관계없이 원형 선택 범위가 이미지 내부에 있다', () => {
  for (const image of [{ width: 1200, height: 800 }, { width: 800, height: 1200 }, { width: 100, height: 100 }]) {
    for (const width of [320, 402]) for (const zoom of [1, 2, 3]) for (const pan of [{ x: 0, y: 0 }, { x: 10000, y: -10000 }, { x: -10000, y: 10000 }]) {
      const { source } = cropGeometry(image, width, zoom, pan);
      assert.ok(source.x >= -1e-8 && source.y >= -1e-8);
      assert.ok(source.x + source.size <= image.width + 1e-8);
      assert.ok(source.y + source.size <= image.height + 1e-8);
    }
  }
});

test('확대할 때 커서 또는 두 손가락 중심의 사진 좌표가 유지된다', () => {
  const image = { width: 1200, height: 800 };
  const current = { zoom: 1.5, pan: { x: 0, y: 0 } };
  const anchor = { x: 180, y: 220 };
  const nextAnchor = { x: 190, y: 230 };
  const before = cropGeometry(image, 402, current.zoom, current.pan);
  const view = zoomCropAt(image, 402, current, 2, anchor, nextAnchor);
  const after = cropGeometry(image, 402, view.zoom, view.pan);
  assert.ok(Math.abs((anchor.x - before.left) / before.width - (nextAnchor.x - after.left) / after.width) < 1e-8);
  assert.ok(Math.abs((anchor.y - before.top) / before.height - (nextAnchor.y - after.top) / after.height) < 1e-8);
});

test('확대와 축소 한계를 넘는 휠 및 핀치에서도 선택 영역이 사진을 벗어나지 않는다', () => {
  const image = { width: 800, height: 1200 };
  for (const requested of [0.001, 1, 2, 100]) {
    const view = zoomCropAt(image, 360, { zoom: 2, pan: { x: 100, y: -100 } }, requested, { x: 0, y: 0 });
    assert.ok(view.zoom >= minimumCropZoom(image, 360) && view.zoom <= 3);
    const { source } = cropGeometry(image, 360, view.zoom, view.pan);
    assert.ok(source.x >= -1e-8 && source.y >= -1e-8);
    assert.ok(source.x + source.size <= image.width + 1e-8);
    assert.ok(source.y + source.size <= image.height + 1e-8);
  }
});
test('초기 배율보다 축소해 원형 선택 영역에 사진의 짧은 변 전체를 담을 수 있다', () => {
  for (const image of [{ width: 1200, height: 800 }, { width: 800, height: 1200 }, { width: 900, height: 900 }]) {
    const frameWidth = 402;
    const minimum = minimumCropZoom(image, frameWidth);
    assert.ok(minimum < 1);
    const view = zoomCropAt(image, frameWidth, { zoom: 1, pan: { x: 0, y: 0 } }, 0.001, { x: 201, y: 216 });
    assert.equal(view.zoom, minimum);
    const crop = cropGeometry(image, frameWidth, view.zoom, view.pan);
    assert.ok(Math.abs(crop.source.size - Math.min(image.width, image.height)) < 1e-8);
    assert.ok(crop.source.x >= -1e-8 && crop.source.y >= -1e-8);
    assert.ok(crop.source.x + crop.source.size <= image.width + 1e-8);
    assert.ok(crop.source.y + crop.source.size <= image.height + 1e-8);
  }
});