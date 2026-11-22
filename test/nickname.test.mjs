import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limitNickname, nicknameCharacters, validateNickname } from '../features/onboarding/nickname-validation.ts';
import { isDemoNicknameTaken } from '../features/onboarding/nickname-demo.ts';

test('한글, 영문, 숫자는 각각 한 글자이며 10글자까지만 유지한다', () => {
  assert.equal(nicknameCharacters('가나다abc123').length, 9);
  assert.equal(limitNickname('가나다라마바사abc123'), '가나다라마바사abc');
  assert.equal(limitNickname('abcdefghijk'), 'abcdefghij');
  assert.equal(limitNickname('12345678901'), '1234567890');
});

test('분리된 한글은 NFC로 합쳐 세고 결합 문자를 중간에서 자르지 않는다', () => {
  assert.equal(nicknameCharacters('가나').length, 2);
  assert.equal(limitNickname('가나'), '가나');
  assert.equal(nicknameCharacters('á').length, 1);
});

test('닉네임 상태를 구분한다', () => {
  assert.equal(validateNickname(''), 'empty');
  assert.equal(validateNickname('타'), 'too-short');
  assert.equal(validateNickname('홍  길  동.'), 'invalid-characters');
  assert.equal(validateNickname('닉네임😀'), 'invalid-characters');
  assert.equal(validateNickname('관리자'), 'unavailable-word');
  assert.equal(validateNickname('ADMIN'), 'unavailable-word');
  assert.equal(validateNickname('씨발'), 'unavailable-word');
  assert.equal(validateNickname('minju'), 'valid');
  assert.equal(validateNickname('한글12AB'), 'valid');
});

test('중복 예시는 실제 DB 확인과 분리한다', () => {
  assert.equal(isDemoNicknameTaken('홍길동'), true);
  assert.equal(isDemoNicknameTaken('minju'), false);
});

test('자음과 모음이 각각 입력되어도 조합 단계마다 10글자로 제한한다', () => {
  let value = '';
  for (const character of 'ㅇㅇㅇㅇㅇㅇㅇㅇㅇㅇㅐ') {
    value = limitNickname(value + character);
    assert.ok(nicknameCharacters(value).length <= 10);
  }
  assert.equal(value, 'ㅇㅇㅇㅇㅇㅇㅇㅇㅇㅇ');
  assert.equal(validateNickname('ㅇㅇㅇㅇㅇㅇㅇㅇㅇㅇㅐ'), 'too-long');
  assert.equal(limitNickname('가나다라마바사아자차'), '가나다라마바사아자차');
  assert.equal(limitNickname('가나다라마바사아자착'), '가나다라마바사아자착');
});
test('한글 원문자와 보이지 않는 한글 채움 문자는 거부한다', () => {
  for (const value of ['\u3260\u3261', '\u3164\u3164', '가\u115F', '가\u1160', '\uFFA0\uFFA0']) {
    assert.equal(validateNickname(value), 'invalid-characters', JSON.stringify(value));
  }
});

test('정상 한글 음절과 자모, 영문, 숫자는 계속 허용한다', () => {
  for (const value of ['한글12AB', 'ㄱㄴ', 'ㅏㅐ', '가나', 'A\u1100', 'A\u1161', 'A\u11A8']) {
    assert.equal(validateNickname(value), 'valid', JSON.stringify(value));
  }
});