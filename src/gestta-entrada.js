// Entrada na página do Gestta (mundo isolado): liga o modo aprender enquanto a pessoa pediu, guarda as chamadas observadas
// (rota, método, nomes de campos) e inicia a leitura automática dos funcionários.
(() => {
  if (window.top !== window || window.__ctmGesttaEntrada) return;
  window.__ctmGesttaEntrada = true;
  const OBS = 'monitor-gestta-observadas', ALVO = 'monitor-aprender';
  async function ligar() { try { const r = (await chrome.storage.local.get(ALVO))[ALVO]; document.documentElement.setAttribute('data-ctm-aprender', r && r.ate > Date.now() ? '1' : '0'); } catch (e) { /* sem storage */ } }
  ligar(); setInterval(ligar, 30000);
  try { chrome.storage.onChanged.addListener(ch => { if (ch[ALVO]) ligar(); }); } catch (e) { /* nada */ }
  const buf = new Map(); let t = null;
  async function salvar() {
    const atual = (await chrome.storage.local.get(OBS))[OBS] || {};
    for (const [k, g] of buf) { const a = atual[k]; atual[k] = { metodo: g.metodo, rota: g.rota, status: g.status, n: (a ? a.n : 0) + g.n, campos: g.campos.length ? g.campos : (a ? a.campos : []), corpo: g.corpo.length ? g.corpo : (a ? a.corpo : []) }; }
    buf.clear();
    const chaves = Object.keys(atual); if (chaves.length > 300) chaves.slice(0, chaves.length - 300).forEach(k => delete atual[k]);
    await chrome.storage.local.set({ [OBS]: atual });
  }
  document.addEventListener('ctm-gestta-chamada', e => {
    try {
      const d = JSON.parse(e.detail), k = d.m + ' ' + d.r, g = buf.get(k) || { metodo: d.m, rota: d.r, status: d.s, campos: [], corpo: [], n: 0 };
      g.n++; g.status = d.s; if (d.c && d.c.length) g.campos = d.c; if (d.b && d.b.length) g.corpo = d.b; buf.set(k, g);
      clearTimeout(t); t = setTimeout(() => salvar().catch(() => {}), 1500);
    } catch (x) { /* ignora */ }
  });
  import(chrome.runtime.getURL('src/gestta-auto.js')).then(m => m.iniciar()).catch(() => { /* leitura automática indisponível */ });
})();
