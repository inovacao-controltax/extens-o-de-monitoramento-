// Abre o hub POR CIMA do Onvio (camada) quando a guia de agora é do Onvio; fora dele, numa guia própria.
import { leituraPermitida } from './onvio-reader.js';
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

// Leitura no mundo da página, a pedido do script que já roda NA aba do Onvio (reserva, quando a leitura de dentro da página falha).
// Só GET, só rotas da lista fechada, só para a aba que pediu e só se ela for o Onvio do escritório.
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (!msg || msg.tipo !== 'ler-onvio') return;
  (async () => {
    try {
      if (!sender.tab || !ehOnvio(sender.tab.url) || !leituraPermitida(msg.url)) return responder({ status: 0, ct: '', body: 'pedido recusado' });
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id }, world: 'MAIN', args: [msg.url],
        func: async u => { try { if (!u.startsWith('https://onvio.com.br/api/')) return { status: 0, ct: '', body: 'fora do Onvio' }; const r = await fetch(u, { credentials: 'include' }); return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() }; } catch (e) { return { status: 0, ct: '', body: String(e) }; } },
      });
      responder((res && res.result) || { status: 0, ct: '', body: 'sem resposta da aba' });
    } catch (e) { responder({ status: 0, ct: '', body: String(e && e.message || e) }); }
  })();
  return true;
});

// Empresas treinadas direto do Control Hub: só a pedido de uma página da própria extensão. Procura as abas do claude.ai e pergunta à ponte
// (src/ponte-treinados.js), que só entrega o que o Hub verdadeiro (prova do código de pareamento) responder. Nada é lido da página.
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (!msg || msg.tipo !== 'puxar-treinados') return;
  (async () => {
    try {
      if (sender.id !== chrome.runtime.id) return responder({ ok: false, motivo: 'recusado' });      // só a própria extensão (páginas ou scripts dela)
      const abas = await chrome.tabs.query({ url: 'https://claude.ai/*' });
      if (!abas.length) return responder({ ok: false, motivo: 'sem-hub' });
      let ultimo = { ok: false, motivo: 'sem-ponte' };
      for (const a of abas) {
        try { const r = await chrome.tabs.sendMessage(a.id, { tipo: 'hub-treinados' }); if (r && r.ok) return responder(r); if (r) ultimo = r; } catch (e) { /* aba sem a ponte: recarregar (F5) */ }
      }
      responder(ultimo);
    } catch (e) { responder({ ok: false, motivo: 'erro', mensagem: String(e && e.message || e).slice(0, 160) }); }
  })();
  return true;
});
