/* Hub de Monitoramento · ponte com o Control Hub (só no claude.ai). Carteiro: pergunta ao Hub quais empresas estão 100% treinadas
 * e devolve a lista à extensão. Não lê nem altera nada da página do claude.ai além dessas mensagens.
 * Protocolo (o mesmo do Control Onvio): o Hub avisa {ctlhub:1, de:'hub', tipo:'ola'}; esta ponte desafia {tipo:'busca', nonce} e só trata como Hub
 * a janela que responder com a prova HMAC-SHA256(código de pareamento, nonce). Depois manda {tipo:'consulta', acao:'treinados', id, token} e o Hub
 * responde {tipo:'consultaAck', id, ok, treinados}. O código fica em chrome.storage.local (monitor-config.hubCodigo) e só sai para a janela que provou. */
(function () {
  'use strict';
  if (window.__monitorPonteTreinados) return;
  window.__monitorPonteTreinados = true;
  const MEMORIA_MS = 6 * 3600 * 1000;
  let hub = null;                     // { win, em }
  const desafios = new Map();         // nonce -> { win, ate }
  const pendentes = new Map();        // id -> função que recebe a resposta
  const ultimoDesafio = new WeakMap();
  const vivo = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const novoNonce = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
  async function codigo() { try { const r = await chrome.storage.local.get('monitor-config'); return String((r['monitor-config'] || {}).hubCodigo || '').trim(); } catch (e) { return ''; } }
  async function hmacHex(chave, texto) {
    const enc = new TextEncoder(), k = await crypto.subtle.importKey('raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texto))), b => b.toString(16).padStart(2, '0')).join('');
  }
  function desafiar(win) {
    if (!win || !vivo()) return;
    const agora = Date.now();
    if (ultimoDesafio.get(win) && agora - ultimoDesafio.get(win) < 800) return;
    ultimoDesafio.set(win, agora);
    for (const [n, x] of desafios) if (x.ate < agora) desafios.delete(n);
    if (desafios.size > 30) return;
    const nonce = novoNonce(); desafios.set(nonce, { win, ate: agora + 15000 });
    try { win.postMessage({ ctlhub: 1, de: 'ponte', tipo: 'busca', nonce }, '*'); } catch (e) { /* quadro fechado */ }
  }
  window.addEventListener('message', async e => {
    const d = e.data;
    if (!d || d.ctlhub !== 1 || d.de !== 'hub' || !vivo()) return;
    if (d.tipo === 'ola') {
      if (!d.nonce) { if (!(hub && hub.win === e.source && Date.now() - hub.em < 30000)) desafiar(e.source); return; }   // sem prova: manda o desafio
      const x = desafios.get(String(d.nonce));
      if (!x || x.win !== e.source || x.ate < Date.now()) return;
      desafios.delete(String(d.nonce));
      const token = await codigo();
      if (token && d.prova && d.prova === await hmacHex(token, String(d.nonce))) hub = { win: e.source, em: Date.now() };
    } else if (d.tipo === 'consultaAck') {
      const r = pendentes.get(String(d.id)); if (r) { pendentes.delete(String(d.id)); r(d); }
    }
  });
  const pedirAviso = () => { try { document.querySelectorAll('iframe').forEach(f => { try { desafiar(f.contentWindow); } catch (e) { /* quadro fechado */ } }); } catch (e) { /* sem DOM ainda */ } };
  const espera = ms => new Promise(r => setTimeout(r, ms));
  async function acharHub() {
    for (let i = 0; i < 12; i++) {
      if (hub && Date.now() - hub.em < MEMORIA_MS) return hub;
      pedirAviso(); await espera(500);
    }
    return null;
  }
  async function consultar(acao, extra) {
    const token = await codigo();
    if (!token) return { ok: false, motivo: 'sem-codigo' };
    const h = await acharHub();
    if (!h) return { ok: false, motivo: 'sem-hub' };
    const id = novoNonce();
    const resposta = new Promise(r => { pendentes.set(id, r); setTimeout(() => { if (pendentes.delete(id)) r({ ok: false, motivo: 'sem-resposta' }); }, 20000); });
    try { h.win.postMessage(Object.assign({ ctlhub: 1, de: 'ext', tipo: 'consulta', acao, id, token }, extra || {}), '*'); } catch (e) { hub = null; return { ok: false, motivo: 'sem-hub' }; }
    const r = await resposta;
    if (!r.ok && (r.motivo === 'token')) hub = null;
    return r.ok ? { ok: true, treinados: Array.isArray(r.treinados) ? r.treinados : [], contatos: Array.isArray(r.contatos) ? r.contatos : [], demanda: Array.isArray(r.demanda) ? r.demanda : [] } : { ok: false, motivo: String(r.motivo || 'erro'), mensagem: String(r.mensagem || '') };
  }
  try {
    chrome.runtime.onMessage.addListener((msg, sender, responder) => {
      if (!msg || !vivo()) return;
      if (msg.tipo === 'hub-treinados') { consultar('treinados').then(responder, () => responder({ ok: false, motivo: 'erro' })); return true; }
      if (msg.tipo === 'hub-demanda') { consultar('demanda').then(responder, () => responder({ ok: false, motivo: 'erro' })); return true; }
      if (msg.tipo === 'hub-contatos' && /^[0-9A-Z]{8}$/.test(String(msg.raiz || ''))) { consultar('contatos', { raiz: String(msg.raiz) }).then(responder, () => responder({ ok: false, motivo: 'erro' })); return true; }
    });
  } catch (e) { /* extensão atualizada: recarregue a aba */ }
})();
