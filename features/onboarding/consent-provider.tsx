'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { initialConsents, type Consents, type TermId } from './terms';

type ConsentContext = {
  consents: Consents;
  setConsent: (id: TermId, checked: boolean) => void;
  setAll: (checked: boolean) => void;
};
const Context = createContext<ConsentContext | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consents, setConsents] = useState<Consents>({ ...initialConsents });
  return <Context.Provider value={{
    consents,
    setConsent: (id, checked) => setConsents(previous => ({ ...previous, [id]: checked })),
    setAll: checked => setConsents({ service: checked, privacy: checked, location: checked, marketing: checked }),
  }}>{children}</Context.Provider>;
}

export function useConsents() {
  const value = useContext(Context);
  if (!value) throw new Error('ConsentProvider is required');
  return value;
}
