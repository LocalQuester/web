// Figma 중복 상태를 로컬에서 확인하기 위한 예시입니다.
// 실제 계정 데이터나 닉네임 예약이 아니며 API 연결 시 교체합니다.
const demoTakenNicknames = new Set(['홍길동']);

export function isDemoNicknameTaken(value: string) {
  return demoTakenNicknames.has(value.normalize('NFC'));
}
