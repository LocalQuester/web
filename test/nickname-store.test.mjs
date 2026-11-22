import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readNicknameDraft, writeNicknameDraft, subscribeNicknameDraft } from '../features/onboarding/profile-nickname-store.ts';

test('세션 저장 실패 시 새 닉네임을 유지하고 저장 복구 후에는 세션 값을 사용한다', () => {
  const previousWindow = globalThis.window;
  let stored = '가';
  let failWrite = false;
  let failRead = false;
  const target = new EventTarget();
  target.sessionStorage = {
    getItem() { if (failRead) throw new Error('Storage blocked'); return stored; },
    setItem(_key, value) { if (failWrite) throw new DOMException('Storage full', 'QuotaExceededError'); stored = value; },
  };
  globalThis.window = target;
  let notifications = 0;
  const unsubscribe = subscribeNicknameDraft(() => { notifications += 1; });
  try {
    assert.equal(readNicknameDraft(), '가');
    failWrite = true;
    writeNicknameDraft('가나');
    assert.equal(stored, '가');
    assert.equal(readNicknameDraft(), '가나');
    assert.equal(notifications, 1);
    failRead = true;
    writeNicknameDraft('가나다');
    assert.equal(readNicknameDraft(), '가나다');
    failRead = false;
    failWrite = false;
    writeNicknameDraft('복구');
    assert.equal(stored, '복구');
    stored = '세션복원';
    assert.equal(readNicknameDraft(), '세션복원');
    unsubscribe();
    writeNicknameDraft('마지막');
    assert.equal(notifications, 3);
  } finally {
    unsubscribe();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});