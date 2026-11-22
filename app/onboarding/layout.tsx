import type { ReactNode } from 'react';
import { ProfileDraftProvider } from '../../features/onboarding/profile-draft-provider';
import { ConsentProvider } from '../../features/onboarding/consent-provider';
import 'pretendard/dist/web/static/pretendard.css';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <ConsentProvider><ProfileDraftProvider>{children}</ProfileDraftProvider></ConsentProvider>;
}
