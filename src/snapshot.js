// Coleta guardada no navegador (chrome.storage.local, com "unlimitedStorage"). Nada sai da máquina.
const KEY = 'monitor-snapshot';
const ext = () => (typeof chrome !== 'undefined' && chrome.storage?.local) || null;
export async function loadSnapshot() {
  try {
    if (ext()) return (await ext().get(KEY))[KEY] || null;
    if (typeof localStorage !== 'undefined') return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) { console.error('loadSnapshot', e); }
  return null;
}
export async function saveSnapshot(s) {
  if (ext()) await ext().set({ [KEY]: s });
  else if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s));
}
export async function clearSnapshot() {
  if (ext()) await ext().remove(KEY);
  else if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
}
