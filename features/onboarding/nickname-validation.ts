export const NICKNAME_MAX_LENGTH = 10;
export const NICKNAME_MIN_LENGTH = 2;

// 현대 한글 음절과 자모만 허용하며 원문자와 한글 채움 문자는 제외합니다.
const allowedCharacters = /^[가-힣ㄱ-ㅎㅏ-ㅣ\u1100-\u1112\u1161-\u1175\u11A8-\u11C2A-Za-z0-9]+$/u;

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

export function nicknameCharacters(value: string): string[] {
  return Array.from(segmenter.segment(value.normalize('NFC')), item => item.segment);
}

export function limitNickname(value: string): string {
  return nicknameCharacters(value).slice(0, NICKNAME_MAX_LENGTH).join('');
}

// 초기 정책 목록입니다. 실제 가입 API에서도 동일한 정책을 검증해야 합니다.
const forbiddenWords = ['씨발', '병신', 'fuck'];
const reservedNames = new Set(['관리자', '운영자', 'admin', 'administrator', 'localquester']);

export function containsUnavailableWord(value: string): boolean {
  const normalized = value.normalize('NFKC').toLowerCase();
  return reservedNames.has(normalized) || forbiddenWords.some(word => normalized.includes(word));
}

export type NicknameValidation = 'empty' | 'too-short' | 'too-long' | 'invalid-characters' | 'unavailable-word' | 'valid';

export function validateNickname(value: string): NicknameValidation {
  const normalized = value.normalize('NFC');
  const count = nicknameCharacters(normalized).length;
  if (!count) return 'empty';
  if (count > NICKNAME_MAX_LENGTH) return 'too-long';
  if (!allowedCharacters.test(normalized)) return 'invalid-characters';
  if (count < NICKNAME_MIN_LENGTH) return 'too-short';
  if (containsUnavailableWord(normalized)) return 'unavailable-word';
  return 'valid';
}
