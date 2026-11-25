
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './bottom-nav.module.css';

type Tab = 'home' | 'map' | 'ar' | 'collection' | 'profile';

const tabs: {
  id: Tab;
  label: string;
  href?: string;
}[] = [
  { id: 'home', label: '홈', href: '/home' },
  { id: 'map', label: '지도' },
  { id: 'ar', label: 'AR' },
  { id: 'collection', label: '수집' },
  { id: 'profile', label: '프로필' },
];

const icons = {
  home: {
    active: '/figma/icons/home-active.svg',
    inactive: '/figma/icons/home-inactive.svg',
  },
  map: {
    active: '/figma/icons/map-active.svg',
    inactive: '/figma/icons/map-inactive.svg',
  },
  ar: {
    active: '/figma/icons/ar.svg',
    inactive: '/figma/icons/ar.svg',
  },
  collection: {
    active: '/figma/icons/collection-active.svg',
    inactive: '/figma/icons/collection-inactive.svg',
  },
  profile: {
    active: '/figma/icons/profile-active.svg',
    inactive: '/figma/icons/profile-inactive.svg',
  },
};

function NavIcon({
  name,
  active,
}: {
  name: Tab;
  active: boolean;
}) {
  const icon = icons[name];

  return (
    <img
      src={active ? icon.active : icon.inactive}
      alt=""
      width={name === 'ar' ? 32 : 24}
      height={name === 'ar' ? 32 : 24}
      draggable={false}
    />
  );
}

export function BottomNav({
  previewActive,
}: {
  previewActive?: Tab;
}) {
  const pathname = usePathname();

  const [selectedTab, setSelectedTab] = useState<Tab>(
    previewActive ?? 'home'
  );

  const isPreview = previewActive !== undefined;

  function isActive(id: Tab) {
    if (isPreview) {
      return selectedTab === id;
    }

    if (id === 'home') {
      return (
        pathname === '/home' ||
        pathname.startsWith('/ai-course')
      );
    }

    if (id === 'map') {
      return pathname.startsWith('/map');
    }

    return pathname === tabs.find(
      (tab) => tab.id === id
    )?.href;
  }

  return (
    <nav
      className={styles.nav}
      aria-label="하단 내비게이션"
    >
      {tabs.map((tab) => {
        const active = isActive(tab.id);

        const className = [
          styles.item,
          active ? styles.active : '',
          tab.id === 'ar' ? styles.arItem : '',
        ].join(' ');

        const content = (
          <>
            <span
              className={
                tab.id === 'ar'
                  ? styles.arIcon
                  : styles.icon
              }
            >
              <NavIcon name={tab.id} active={active} />
            </span>

            <span className={styles.label}>
              {tab.label}
            </span>
          </>
        );

        if (isPreview || !tab.href) {
          return (
            <button
              key={tab.id}
              type="button"
              className={className}
              disabled={!isPreview}
              style={isPreview ? undefined : { cursor: 'default' }}
              onClick={isPreview ? () => setSelectedTab(tab.id) : undefined}
              aria-pressed={isPreview ? active : undefined}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={className}
            aria-current={active ? 'page' : undefined}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
