const STORAGE_KEY = 'localquester:onboarding:nickname';
const CHANGE_EVENT = 'localquester:nickname-change';
let fallback = '';
let preferMemory = false;

export function readNicknameDraft(): string {
  if (preferMemory) return fallback;
  try { return window.sessionStorage.getItem(STORAGE_KEY) ?? fallback; }
  catch { return fallback; }
}

export function writeNicknameDraft(value: string) {
  fallback = value;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
    preferMemory = false;
  } catch {
    // 저장소에 이전 값이 남아 있어도 가장 최근 입력을 우선합니다.
    preferMemory = true;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeNicknameDraft(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function serverNicknameDraft() { return ''; }
