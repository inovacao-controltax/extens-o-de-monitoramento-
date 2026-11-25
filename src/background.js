// Abre o hub POR CIMA do Onvio (camada) quando a guia de agora é do Onvio; fora dele, numa guia própria.
const HUB = 'hub/hub.html';
const ehOnvio = url => { try { const u = new URL(url); return u.origin === 'https://onvio.com.br' && !/^\/clientcenter(\/|$)/i.test(u.pathname); } catch (e) { return false; } };

async function abrirGuiaDoHub() {
  const url = chrome.runtime.getURL(HUB);
  const [existente] = await chrome.tabs.query({ url });
  if (existente) { await chrome.tabs.update(existente.id, { active: true }); await chrome.windows.update(existente.windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
}
async function alternarNaGuia(tab) {
  if (!tab || !ehOnvio(tab.url)) return abrirGuiaDoHub();
  try { await chrome.tabs.sendMessage(tab.id, { tipo: 'controlmon-alternar' }); }
  catch (e) {
    // Guia aberta antes de instalar/atualizar: injeta a camada e tenta de novo.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/overlay.js'] });
      await chrome.tabs.sendMessage(tab.id, { tipo: 'controlmon-alternar' });
    } catch (e2) { console.error('camada', e2); await abrirGuiaDoHub(); }
  }
}
async function guiaDeAgora() { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return t; }

chrome.action.onClicked.addListener(async tab => { try { await alternarNaGuia(tab); } catch (e) { console.error('abrir hub', e); } });
chrome.commands.onCommand.addListener(async cmd => { if (cmd === 'alternar-camada') { try { await alternarNaGuia(await guiaDeAgora()); } catch (e) { console.error('atalho', e); } } });
