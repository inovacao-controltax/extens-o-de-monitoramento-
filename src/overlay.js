// Camada por cima do Onvio: uma bolinha na página e, ao clicar, o hub em tela cheia (iframe da extensão).
// Regras (as mesmas do Control Onvio): nunca abre sozinha (só com clique de verdade, atalho ou ícone), não lê a página,
// não usa rede, não roda na visão do cliente. Fechar só esconde: uma coleta em andamento continua por trás.
(() => {
  if (window.top !== window || window.__controlMonCamada) return;
  if (/^\/clientcenter(\/|$)/i.test(location.pathname)) return;
  window.__controlMonCamada = true;

  const ORIGEM = new URL(chrome.runtime.getURL('')).origin;
  const host = document.createElement('div');
  host.id = 'controlmon-camada';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;inset:0;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box}
    #b{pointer-events:auto;position:fixed;right:20px;bottom:84px;width:48px;height:48px;padding:0;border:3px solid transparent;border-radius:10px;background:#fff;display:grid;place-items:center;cursor:grab;box-shadow:0 2px 6px rgba(0,0,0,.3),0 8px 20px rgba(0,0,0,.25);touch-action:none;transition:border-color .2s}
    #b img{height:30px;width:auto;pointer-events:none;display:block}
    #b:hover{filter:brightness(.96)} #b:focus-visible{outline:3px solid #8CC6EC;outline-offset:2px} #b.arr{cursor:grabbing}
    #v{pointer-events:auto;position:fixed;inset:0;background:#0B1015}
    #v[hidden],#b[hidden]{display:none}
    iframe{width:100%;height:100%;border:0;display:block;background:#fff}
  </style>
  <button id="b" type="button" aria-label="Abrir o Hub de Monitoramento" title="Hub de Monitoramento (Alt+Shift+M)"><img alt="" src="${chrome.runtime.getURL('hub/logo.svg')}"></button>
  <div id="v" hidden role="dialog" aria-modal="true" aria-label="Hub de Monitoramento do Portal"></div>`;
  document.documentElement.appendChild(host);
  const b = root.getElementById('b'), v = root.getElementById('v');
  let frame = null;

  const aberto = () => !v.hidden;
  function abrir() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'Hub de Monitoramento do Portal';
      frame.src = chrome.runtime.getURL('hub/hub.html?camada=1');
      v.appendChild(frame);
    }
    v.hidden = false; b.hidden = true;
    setTimeout(() => { try { frame.focus(); } catch (e) { /* sem foco */ } }, 50);
  }
  function fechar() { v.hidden = true; b.hidden = false; }
  const alternar = () => (aberto() ? fechar() : abrir());

  // Clique de verdade (nunca um clique forjado pela página) abre; arrastar só muda a posição.
  let arr = null;
  b.addEventListener('pointerdown', e => { if (!e.isTrusted) return; arr = { x: e.clientX, y: e.clientY, r: innerWidth - b.getBoundingClientRect().right, bt: innerHeight - b.getBoundingClientRect().bottom, mov: false }; b.setPointerCapture(e.pointerId); });
  b.addEventListener('pointermove', e => {
    if (!arr) return;
    const dx = e.clientX - arr.x, dy = e.clientY - arr.y;
    if (!arr.mov && Math.hypot(dx, dy) < 5) return;
    arr.mov = true; b.classList.add('arr');
    b.style.right = Math.max(4, Math.min(innerWidth - 52, arr.r - dx)) + 'px';
    b.style.bottom = Math.max(4, Math.min(innerHeight - 52, arr.bt - dy)) + 'px';
  });
  b.addEventListener('pointerup', e => {
    const moveu = arr && arr.mov; b.classList.remove('arr'); arr = null;
    if (moveu) { try { chrome.storage.local.set({ posBolinhaMonitor: { right: b.style.right, bottom: b.style.bottom } }); } catch (x) { /* sem storage */ } return; }
    if (e.isTrusted) abrir();
  });
  b.addEventListener('keydown', e => { if (e.isTrusted && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); } });
  try { chrome.storage.local.get('posBolinhaMonitor').then(r => { const p = r && r.posBolinhaMonitor; if (p) { b.style.right = p.right; b.style.bottom = p.bottom; } }); } catch (e) { /* sem storage */ }

  window.addEventListener('keydown', e => { if (aberto() && e.key === 'Escape') fechar(); }, true);
  // O hub (dentro do quadro) pede para fechar. Só vale da janela do nosso quadro e da origem da extensão.
  window.addEventListener('message', e => { if (frame && e.source === frame.contentWindow && e.origin === ORIGEM && e.data && e.data.tipo === 'controlmon-fechar') fechar(); });
  chrome.runtime.onMessage.addListener(m => { if (m && m.tipo === 'controlmon-alternar') alternar(); });

  // Leitura automática do Onvio em segundo plano (sem clique). O andamento aparece na dica e na cor da bolinha.
  const dica = 'Hub de Monitoramento (Alt+Shift+M)';
  function estado(e) {
    b.title = e.estado === 'rodando' ? `${dica}\nLendo o Onvio: ${e.msg || ''}` : e.estado === 'ok' ? `${dica}\n${e.msg}` : e.estado === 'cliente' ? dica : `${dica}\nLeitura: ${e.msg || e.estado}`;
    b.style.borderColor = e.estado === 'rodando' ? '#B5530C' : 'transparent';   // laranja enquanto lê
  }
  import(chrome.runtime.getURL('src/auto-coleta.js')).then(m => m.iniciar({ onEstado: estado })).catch(() => { /* leitura automática indisponível */ });
})();
