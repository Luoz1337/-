
let deferredPrompt = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    document.dispatchEvent(new CustomEvent('install-available'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.dispatchEvent(new CustomEvent('install-done'));
  });
}

export function canInstall() {
  return Boolean(deferredPrompt);
}

export function isNativeApp() {
  return typeof navigator !== 'undefined' && /SuperTableApp/i.test(navigator.userAgent);
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  try {
    event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}
