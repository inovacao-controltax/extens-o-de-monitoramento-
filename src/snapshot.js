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

// Última coleta COMPLETA, guardada à parte: a leitura em andamento grava parciais em `monitor-snapshot` a cada poucos segundos, e com elas
// os números das telas subiam e desciam. O painel mostra sempre o último resultado completo enquanto a leitura nova não termina.
export const KEY_COMPLETO = 'monitor-snapshot-completo';
export async function loadSnapshotCompleto() {
  try {
    if (ext()) return (await ext().get(KEY_COMPLETO))[KEY_COMPLETO] || null;
    if (typeof localStorage !== 'undefined') return JSON.parse(localStorage.getItem(KEY_COMPLETO) || 'null');
  } catch (e) { console.error('loadSnapshotCompleto', e); }
  return null;
}
export async function saveSnapshotCompleto(s) {
  if (ext()) await ext().set({ [KEY_COMPLETO]: s });
  else if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_COMPLETO, JSON.stringify(s));
}
/** Qual coleta mostrar: a que está sendo lida só vale quando termina; enquanto isso (ou se foi interrompida), a última completa. */
export function snapshotEstavel(atual, completo) {
  const onvio = x => (x && x.fonte === 'onvio' ? x : null);
  const a = onvio(atual), c = onvio(completo);
  if (a && !a.lendo && !a.parcial) return a;                      // terminou: é a mais nova
  if (c) return { ...c, _atualizando: !!(a && a.lendo) };         // lendo ou interrompida: números estáveis da última completa
  return a;                                                       // primeira leitura: só há parcial (a tela avisa que ainda vai mudar)
}
