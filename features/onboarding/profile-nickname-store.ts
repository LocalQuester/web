const STORAGE_KEY = 'localquester:onboarding:nickname';
const CHANGE_EVENT = 'localquester:nickname-change';
let fallback = '';

export function readNicknameDraft(): string {
  try { return window.sessionStorage.getItem(STORAGE_KEY) ?? fallback; }
  catch { return fallback; }
}

export function writeNicknameDraft(value: string) {
  fallback = value;
  try { window.sessionStorage.setItem(STORAGE_KEY, value); } catch { /* 저장소 사용이 막혀도 현재 탭에서 유지합니다. */ }
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
