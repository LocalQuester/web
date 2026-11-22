export const terms = [
  { id: 'service', title: 'LOCAL QUESTER 이용약관 동의', detailTitle: 'LOCAL QUESTER 서비스 이용약관', required: true },
  { id: 'privacy', title: '개인정보 수집 및 이용 동의', detailTitle: '개인정보 수집 및 이용 동의', required: true },
  { id: 'location', title: '위치기반 서비스 이용약관 동의', detailTitle: '위치기반 서비스 이용약관', required: true },
  { id: 'marketing', title: '마케팅 목적 광고성 정보 수신 동의', detailTitle: '마케팅 정보 수신 동의', required: false },
] as const;

export type TermId = typeof terms[number]['id'];
export type Consents = Record<TermId, boolean>;
export const initialConsents: Consents = { service: false, privacy: false, location: false, marketing: false };
export const allRequiredAccepted = (consents: Consents) => terms.every(term => !term.required || consents[term.id]);
