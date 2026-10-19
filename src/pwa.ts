import { useEffect, useState } from 'react';

/** Registers the service worker in production builds. */
export function registerServiceWorker() {
  if (!(import.meta as ImportMeta & { env: { PROD: boolean } }).env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker failed:', err));
  });
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser offers installation once, early; keep the event until a button uses it.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * How the app can be installed here: 'prompt' (Android/desktop Chrome and Edge),
 * 'ios' (Safari's Share → Add to Home Screen), or null (installed or unsupported).
 */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const mode: 'prompt' | 'ios' | null = isStandalone() ? null : deferred ? 'prompt' : isIos() ? 'ios' : null;
  const install = async () => {
    if (!deferred) return;
    const ev = deferred;
    deferred = null;
    await ev.prompt();
    await ev.userChoice.catch(() => undefined);
    listeners.forEach((fn) => fn());
  };
  return { mode, install };
}
