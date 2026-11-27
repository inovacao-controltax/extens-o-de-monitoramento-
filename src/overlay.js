// Camada por cima do Onvio: uma bolinha na página e, ao clicar, o hub em tela cheia (iframe da extensão).
// Regras (as mesmas do Control Onvio): nunca abre sozinha (só com clique de verdade, atalho ou ícone), não lê a página,
// não usa rede, não roda na visão do cliente. Fechar só esconde: uma coleta em andamento continua por trás.
(() => {
  if (window.top !== window || window.__controlMonCamada) return;
  const NO_GESTTA = location.hostname === 'app.gestta.com.br';
  if (!NO_GESTTA && /^\/clientcenter(\/|$)/i.test(location.pathname)) return;
  window.__controlMonCamada = true;

  const ORIGEM = new URL(chrome.runtime.getURL('')).origin;
  const host = document.createElement('div');
  host.id = 'controlmon-camada';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;inset:0;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box}
    #b{pointer-events:auto;position:fixed;right:20px;bottom:24px;width:48px;height:48px;padding:0;border:3px solid transparent;border-radius:10px;background:#fff;display:grid;place-items:center;cursor:grab;box-shadow:0 2px 6px rgba(0,0,0,.3),0 8px 20px rgba(0,0,0,.25);touch-action:none;transition:border-color .2s}
    #b img{height:30px;width:auto;pointer-events:none;display:block}
    #n{position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#C2000C;color:#fff;font:700 11.5px/20px system-ui,sans-serif;text-align:center;pointer-events:none;box-shadow:0 0 0 2px #fff}
    #n[hidden]{display:none}
    #b:hover{filter:brightness(.96)} #b:focus-visible{outline:3px solid #8CC6EC;outline-offset:2px} #b.arr{cursor:grabbing}
    #v{pointer-events:auto;position:fixed;inset:0;background:#0B1015}
    #v[hidden],#b[hidden]{display:none}
    iframe{width:100%;height:100%;border:0;display:block;background:#fff}
    #av{position:absolute;top:0;left:0;right:0;z-index:2;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:14px 16px;background:#7A1F12;color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)}
    #av[hidden]{display:none} #av button{font:700 13px system-ui,sans-serif;padding:8px 14px;border-radius:4px;border:1px solid #fff;background:#fff;color:#7A1F12;cursor:pointer} #av button.s{background:transparent;color:#fff}
  </style>
  <button id="b" type="button" aria-label="Abrir o Hub de Monitoramento" title="Hub de Monitoramento (Alt+Shift+M)"><img alt="" src="${chrome.runtime.getURL('hub/logo.svg')}"><span id="n" hidden></span></button>
  <div id="v" hidden role="dialog" aria-modal="true" aria-label="Hub de Monitoramento do Portal"><div id="av" hidden role="alert"><span id="avt"></span><button type="button" id="avr">Recarregar a página</button><button type="button" id="avf" class="s">Fechar</button></div></div>`;
  document.documentElement.appendChild(host);
  const b = root.getElementById('b'), v = root.getElementById('v'), nBadge = root.getElementById('n'), av = root.getElementById('av');
  let frame = null, ultimoBatimento = 0, abertoEm = 0, vigia = null;
  // Depois de a extensão ser atualizada ou recarregada com esta página aberta, este script fica "órfão": o endereço do painel deixa de existir
  // e o Chrome mostra "Este arquivo pode ter sido movido, editado ou excluído". Em vez disso, avisa e oferece recarregar a página.
  const vivo = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  // "Ver no portal" das notificações: o Onvio não informa o endereço da tela de notificações do escritório; a extensão aprende quando a pessoa
  // abre essa tela (guarda só o endereço, sem o identificador de um funcionário). Confere a cada 2 s porque o Onvio troca de tela sem recarregar.
  let ultimaUrl = '';
  const aprenderUrl = () => {
    if (!vivo() || location.href === ultimaUrl) return; ultimaUrl = location.href;
    if (!/notifica/i.test(location.href)) return;
    const limpa = location.href.replace(/\/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?=[/?#]|$)/gi, '').replace(/\/[0-9a-f]{24,32}(?=[/?#]|$)/gi, '');
    try { chrome.storage.local.set({ 'monitor-url-notif': limpa }); } catch (e) { /* extensão atualizada: a página antiga não grava */ }
  };
  aprenderUrl(); setInterval(aprenderUrl, 2000);
  function avisarOrfao() {
    root.getElementById('avt').textContent = 'A extensão foi atualizada e esta página ainda usa a versão antiga. Recarregue a página para abrir o painel.';
    av.hidden = false; v.hidden = false; b.hidden = true;
    root.getElementById('avr').onclick = () => location.reload();
    root.getElementById('avf').onclick = () => { av.hidden = true; v.hidden = true; b.hidden = false; };
  }

  const aberto = () => !v.hidden;
  function abrir() {
    if (!vivo()) return avisarOrfao();
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'Hub de Monitoramento do Portal';
      frame.allow = 'clipboard-write';      // "Copiar relatório" e "Copiar texto" funcionarem dentro do quadro
      frame.src = chrome.runtime.getURL('hub/hub.html?camada=1');
      v.appendChild(frame);
    }
    v.hidden = false; b.hidden = true; abertoEm = Date.now(); ultimoBatimento = abertoEm;
    if (!vigia) vigia = setInterval(() => {      // o painel avisa que está vivo a cada 3 s; sem aviso (ou sem extensão) por muito tempo, mostra a saída
      if (v.hidden || !av.hidden) return;
      if (!vivo() || (Date.now() - abertoEm > 7000 && Date.now() - ultimoBatimento > 9000)) { root.getElementById('avt').textContent = vivo() ? 'O painel não respondeu. Se a extensão foi atualizada, recarregue a página.' : 'A extensão foi atualizada e esta página ainda usa a versão antiga. Recarregue a página para abrir o painel.'; av.hidden = false; root.getElementById('avr').onclick = () => location.reload(); root.getElementById('avf').onclick = () => { av.hidden = true; fechar(); }; }
    }, 2000);
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
  window.addEventListener('message', e => {
    if (!(frame && e.source === frame.contentWindow && e.origin === ORIGEM && e.data)) return;
    if (e.data.tipo === 'controlmon-fechar') fechar();
    if (e.data.tipo === 'controlmon-vivo') { ultimoBatimento = Date.now(); if (!av.hidden && vivo()) av.hidden = true; }
  });
  chrome.runtime.onMessage.addListener(m => { if (m && m.tipo === 'controlmon-alternar') alternar(); });

  // Ponto vermelho com o número de pendências NOVAS ainda não vistas (histórico, fase 6). Só mostra; quem marca como vista é o painel.
  const marcaNovas = h => { const n = ((h && h.novas) || []).filter(x => !x.visto).length; nBadge.hidden = !n; nBadge.textContent = n > 99 ? '99+' : String(n); b.title = n ? `Hub de Monitoramento · ${n} pendência${n > 1 ? 's' : ''} nova${n > 1 ? 's' : ''} (Alt+Shift+M)` : 'Hub de Monitoramento (Alt+Shift+M)'; };
  try {
    chrome.storage.local.get('monitor-historico').then(r => marcaNovas(r['monitor-historico']));
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch['monitor-historico']) marcaNovas(ch['monitor-historico'].newValue); });
  } catch (e) { /* sem storage */ }
  // Leitura automática do Onvio em segundo plano (sem clique). O andamento aparece na dica e na cor da bolinha.
  const dica = 'Hub de Monitoramento (Alt+Shift+M)';   // o estado da leitura troca a dica; o contador de novas usa o título quando não há leitura em curso
  function estado(e) {
    b.title = e.estado === 'rodando' ? `${dica}\nLendo o Onvio: ${e.msg || ''}` : e.estado === 'ok' ? `${dica}\n${e.msg}` : e.estado === 'cliente' ? dica : `${dica}\nLeitura: ${e.msg || e.estado}`;
    b.style.borderColor = e.estado === 'rodando' ? '#B5530C' : 'transparent';   // laranja enquanto lê
  }
  // A leitura do Onvio só começa em página do Onvio (no Gestta quem lê é src/gestta-auto.js).
  if (!NO_GESTTA) import(chrome.runtime.getURL('src/auto-coleta.js')).then(m => m.iniciar({ onEstado: estado })).catch(() => { /* leitura automática indisponível */ });
})();
