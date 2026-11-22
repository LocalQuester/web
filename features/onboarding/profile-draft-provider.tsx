'use client';

import { createContext, useContext, useEffect, useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';

import { readNicknameDraft, writeNicknameDraft, subscribeNicknameDraft, serverNicknameDraft } from './profile-nickname-store';

type ProfileDraft = {
  photo: { file: File; url: string } | null;
  setPhoto: (file: File | null) => void;
  nickname: string;
  setNickname: (value: string) => void;
};

const Context = createContext<ProfileDraft | null>(null);

export function ProfileDraftProvider({ children }: { children: ReactNode }) {
  const nickname = useSyncExternalStore(subscribeNicknameDraft, readNicknameDraft, serverNicknameDraft);
  const setNickname = writeNicknameDraft;
  const [photo, setPhotoState] = useState<{ file: File; url: string } | null>(null);
  const setPhoto = useCallback((file: File | null) => {
    setPhotoState(file ? { file, url: URL.createObjectURL(file) } : null);
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  return <Context.Provider value={{ nickname, setNickname, photo, setPhoto }}>{children}</Context.Provider>;
}

export function useProfileDraft() {
  const context = useContext(Context);
  if (!context) throw new Error('ProfileDraftProvider is required');
  return context;
}
