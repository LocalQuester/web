'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type ProfileDraft = {
  nickname: string;
  setNickname: (value: string) => void;
};

const Context = createContext<ProfileDraft | null>(null);

export function ProfileDraftProvider({ children }: { children: ReactNode }) {
  const [nickname, setNickname] = useState('');
  return <Context.Provider value={{ nickname, setNickname }}>{children}</Context.Provider>;
}

export function useProfileDraft() {
  const context = useContext(Context);
  if (!context) throw new Error('ProfileDraftProvider is required');
  return context;
}
