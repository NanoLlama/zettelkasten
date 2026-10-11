// Theme (system / light / dark) and text size, remembered on this device.

export function getAppearance() {
  return {
    theme: localStorage.getItem('zk:theme') || 'system',
    fontScale: Number(localStorage.getItem('zk:fontScale')) || 1,
  };
}

export function setAppearance({ theme, fontScale }) {
  if (theme) localStorage.setItem('zk:theme', theme);
  if (fontScale) localStorage.setItem('zk:fontScale', String(fontScale));
  applyAppearance();
}

export function applyAppearance() {
  const { theme, fontScale } = getAppearance();
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.style.setProperty('--font-scale', String(fontScale));
}
