// Camada por cima do Onvio: uma bolinha na página e, ao clicar, o hub em tela cheia (iframe da extensão).
// Regras (as mesmas do Control Onvio): nunca abre sozinha (só com clique de verdade, atalho ou ícone), não lê a página,
// não usa rede, não roda na visão do cliente. Fechar só esconde: uma coleta em andamento continua por trás.
// Única exceção de leitura: no "Ver no portal" a camada procura na tela só o nome do item pedido, para desenhar o contorno por cima
// (nada é guardado nem enviado, e a página do Onvio não é alterada).
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
    /* a bolinha no desenho da do Control Onvio (círculo de 48 px com o logo num círculo de 34 px), com as cores trocadas: branca por fora, preta por dentro (Josué, 27/11/2026) */
    #b{pointer-events:auto;position:fixed;right:20px;bottom:24px;width:48px;height:48px;padding:0;border:0;border-radius:50%;background:#fff;display:grid;place-items:center;cursor:grab;box-shadow:0 2px 6px rgba(16,24,32,.22),0 10px 24px rgba(16,24,32,.28);touch-action:none;transition:transform .15s ease,box-shadow .2s ease}
    #b .mk{width:34px;height:34px;border-radius:50%;background:#0E151B;display:grid;place-items:center;pointer-events:none}
    #b img{width:17px;height:21px;pointer-events:none;display:block}
    #b.lendo{box-shadow:0 0 0 3px #B5530C,0 2px 6px rgba(16,24,32,.22),0 10px 24px rgba(16,24,32,.28)}
    #n{position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#C2000C;color:#fff;font:700 11.5px/20px system-ui,sans-serif;text-align:center;pointer-events:none;box-shadow:0 0 0 2px #fff}
    #n[hidden]{display:none}
    #b:hover{transform:scale(1.1)} #b:focus-visible{outline:2px solid #6BAAC9;outline-offset:3px} #b.arr{cursor:grabbing;transform:none}
    #v{pointer-events:auto;position:fixed;inset:0;background:#0B1015}
    #v[hidden],#b[hidden]{display:none}
    iframe{width:100%;height:100%;border:0;display:block;background:#fff}
    #av{position:absolute;top:0;left:0;right:0;z-index:2;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:14px 16px;background:#7A1F12;color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)}
    #vp{pointer-events:auto;position:fixed;right:16px;bottom:16px;width:min(340px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#101820;border:1px solid #C9D3DC;border-top:3px solid #3C659B;border-radius:8px;box-shadow:0 8px 24px rgba(16,24,32,.24),0 2px 6px rgba(16,24,32,.14);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;padding:10px 12px 12px}
    #vp[hidden],#hl[hidden]{display:none}
    #vp.cima{bottom:auto;top:16px}
    #vp .top{display:flex;align-items:center;gap:8px}
    #vp .eti{display:inline-flex;align-items:center;gap:5px;color:#3C659B;font-weight:700;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
    #vp .eti svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    #vp .tit{font-weight:700;font-size:13.5px;margin:4px 0 6px}
    #vp dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 10px;margin:0 0 6px;font-size:12.5px}
    #vp dt{color:#47545F} #vp dd{margin:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #vp .mud{margin:0 0 6px;padding:5px 8px;background:#DCE8F1;border-radius:4px;font-size:12.5px;font-weight:600;overflow-wrap:anywhere}
    #vp .st{margin:0 0 8px;color:#47545F;font-size:12px;display:flex;gap:6px;align-items:baseline}
    #vp .st i{flex:none;width:7px;height:7px;border-radius:50%;background:#B5530C;display:inline-block;transform:translateY(-1px)} #vp .st.ok i{background:#2E7D4F} #vp .st.no i{background:#7A8791}
    #vp .bts{display:flex;gap:6px;flex-wrap:wrap}
    #vp button{font:600 12.5px system-ui,sans-serif;height:30px;padding:0 10px;border-radius:4px;cursor:pointer;border:1px solid #C9D3DC;background:#fff;color:#101820}
    #vp button.p{background:#3C659B;border-color:#3C659B;color:#fff} #vp button.p:hover{background:#335789} #vp button:not(.p):hover{background:#F5F8FA}
    #vp button.f{margin-left:auto;height:24px;padding:0 6px;border-color:transparent;color:#47545F;font-size:12px}
    #vp button:focus-visible{outline:3px solid #8CC6EC;outline-offset:2px}
    #hl{position:fixed;pointer-events:none;border:3px solid #3C659B;border-radius:6px;box-shadow:0 0 0 4px rgba(60,101,155,.28);animation:pul 1.4s ease-in-out infinite}
    @keyframes pul{50%{box-shadow:0 0 0 9px rgba(60,101,155,.12)}}
    @media (prefers-reduced-motion:reduce){#hl{animation:none}}
    #av[hidden]{display:none} #av button{font:700 13px system-ui,sans-serif;padding:8px 14px;border-radius:4px;border:1px solid #fff;background:#fff;color:#7A1F12;cursor:pointer} #av button.s{background:transparent;color:#fff}
  </style>
  <button id="b" type="button" aria-label="Abrir o Hub de Monitoramento" title="Hub de Monitoramento (Alt+Shift+M)"><span class="mk"><img alt="" src="${chrome.runtime.getURL('hub/logo.svg')}"></span><span id="n" hidden></span></button>
  <div id="v" hidden role="dialog" aria-modal="true" aria-label="Hub de Monitoramento do Portal"><div id="av" hidden role="alert"><span id="avt"></span><button type="button" id="avr">Recarregar a página</button><button type="button" id="avf" class="s">Fechar</button></div></div>
  <div id="hl" hidden></div><section id="vp" hidden aria-label="Vendo no portal"></section>`;
  document.documentElement.appendChild(host);
  const b = root.getElementById('b'), v = root.getElementById('v'), nBadge = root.getElementById('n'), av = root.getElementById('av'), vp = root.getElementById('vp'), hl = root.getElementById('hl');
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
  // volta = { k, id, corrigir }: quem veio do "Ver no portal" volta para a mesma linha (e, se pediu, a correção dela abre com a confirmação de sempre)
  function abrir(volta) {
    if (!vivo()) return avisarOrfao();
    esconderBarra();
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'Hub de Monitoramento do Portal';
      frame.allow = 'clipboard-write';      // "Copiar relatório" e "Copiar texto" funcionarem dentro do quadro
      const q = volta ? `&volta=${encodeURIComponent(volta.k)}&linha=${encodeURIComponent(volta.id || '')}${volta.corrigir ? '&corrigir=1' : ''}` : '';
      frame.src = chrome.runtime.getURL('hub/hub.html?camada=1' + q);
      v.appendChild(frame);
    } else if (volta) { try { frame.contentWindow.postMessage({ tipo: 'controlmon-voltar', k: volta.k, id: volta.id || '', corrigir: !!volta.corrigir }, ORIGEM); } catch (e) { /* quadro recarregando */ } }
    v.hidden = false; b.hidden = true; abertoEm = Date.now(); ultimoBatimento = abertoEm;
    if (!vigia) vigia = setInterval(() => {      // o painel avisa que está vivo a cada 3 s; sem aviso (ou sem extensão) por muito tempo, mostra a saída
      if (v.hidden || !av.hidden) return;
      if (!vivo() || (Date.now() - abertoEm > 7000 && Date.now() - ultimoBatimento > 9000)) { root.getElementById('avt').textContent = vivo() ? 'O painel não respondeu. Se a extensão foi atualizada, recarregue a página.' : 'A extensão foi atualizada e esta página ainda usa a versão antiga. Recarregue a página para abrir o painel.'; av.hidden = false; root.getElementById('avr').onclick = () => location.reload(); root.getElementById('avf').onclick = () => { av.hidden = true; fechar(); }; }
    }, 2000);
    setTimeout(() => { try { frame.focus(); } catch (e) { /* sem foco */ } }, 50);
  }
  function fechar() { v.hidden = true; b.hidden = !vp.hidden; }
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
    if (e.data.tipo === 'controlmon-ver' && !NO_GESTTA) verNoPortal(e.data.alvo);
    if (e.data.tipo === 'controlmon-vivo') { ultimoBatimento = Date.now(); if (!av.hidden && vivo()) av.hidden = true; }
  });
  chrome.runtime.onMessage.addListener(m => { if (m && m.tipo === 'controlmon-alternar') alternar(); if (m && m.tipo === 'controlmon-ver' && !NO_GESTTA) verNoPortal(m.alvo); });

  // ---- "Ver no portal" (0.37.0) ----
  // A camada sai da frente, o Onvio daqui vai até o item (pelo endereço que o próprio Onvio dá) e esta barra diz o que vai mudar.
  // "Voltar e corrigir" volta à mesma linha e abre a correção dela, que continua pedindo a confirmação de sempre: daqui nada é escrito.
  let ver = null, barra = null, laco = null;      // barra = { alvo, el, t0, rolou }
  const escH = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  function esconderBarra(guardado = true) {
    if (laco) { clearInterval(laco); laco = null; }
    barra = null; vp.hidden = true; hl.hidden = true; vp.innerHTML = '';
    if (v.hidden) b.hidden = false;
    if (guardado && ver) { try { chrome.storage.local.remove(ver.CHAVE_VER); } catch (e) { /* extensão atualizada */ } }
  }
  function estadoBusca(cls, texto) {
    const st = vp.querySelector('.st'); if (!st) return;
    if (st.dataset.cls === cls && st.dataset.t === texto) return;
    st.dataset.cls = cls; st.dataset.t = texto; st.className = 'st ' + cls; st.innerHTML = `<i></i><span>${escH(texto)}</span>`;
  }
  // O nome do item no texto da tela (o que estiver visível; o igual ganha do parecido). Devolve a linha da lista, se for uma linha curta.
  function acharNaTela(nome) {
    if (!ver || !document.body) return null;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let melhor = null, nota = 0;
    for (let n = w.nextNode(), i = 0; n && i < 40000; n = w.nextNode(), i++) {
      const t = n.nodeValue; if (!t || t.length < 2 || t.length > 400) continue;
      const c = ver.casaTexto(t, nome); if (!c || c <= nota) continue;
      const el = n.parentElement; if (!el) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      melhor = el; nota = c; if (c === 2) break;
    }
    if (!melhor) return null;
    const linha = melhor.closest('tr,[role="row"],li');
    if (linha) { const r = linha.getBoundingClientRect(); if (r.height && r.height <= 120) return linha; }
    return melhor;
  }
  function posicionar() {
    if (!barra || !barra.el || !barra.el.isConnected) { hl.hidden = true; return; }
    const r = barra.el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) { hl.hidden = true; return; }
    hl.hidden = false; hl.style.left = (r.left - 5) + 'px'; hl.style.top = (r.top - 5) + 'px'; hl.style.width = (r.width + 10) + 'px'; hl.style.height = (r.height + 10) + 'px';
    // o quadro fica no canto de baixo à direita e nunca cobre o item: se o item passa por esse canto, o quadro sobe para o canto de cima
    const w = vp.offsetWidth + 24, h = vp.offsetHeight + 24;
    const cima = r.right > innerWidth - w && r.bottom > innerHeight - h;
    if (vp.classList.contains('cima') !== cima) vp.classList.toggle('cima', cima);
  }
  function procurar() {
    if (!barra) return;
    const a = barra.alvo;
    if (!a.destaque) return;
    if (!barra.el || !barra.el.isConnected) {
      barra.el = acharNaTela(a.destaque);
      if (barra.el && !barra.rolou) { barra.rolou = true; try { barra.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* sem rolagem */ } }
    }
    posicionar();
    if (barra.el) estadoBusca('ok', 'Em destaque na tela (contorno azul).');
    else if (Date.now() - barra.t0 > 20000) estadoBusca('no', `Não apareceu nesta tela: role a lista ou procure pelo nome${a.copiado ? ' (já copiado: Ctrl+V na busca do Onvio)' : ''}.`);
    else estadoBusca('', 'Procurando na tela do Onvio…');
  }
  addEventListener('scroll', () => { if (barra) posicionar(); }, true);
  addEventListener('resize', () => { if (barra) posicionar(); });
  function mostrarBarra(alvo, pendente) {
    if (laco) { clearInterval(laco); laco = null; }
    barra = { alvo, el: null, t0: Date.now(), rolou: false };
    const linhas = alvo.linhas.map(([r, x]) => `<dt>${escH(r)}</dt><dd title="${escH(x)}">${escH(x)}</dd>`).join('');
    const aviso = pendente ? 'Para mostrar este item o Onvio precisa recarregar esta página, e a leitura em andamento recomeça depois.' : !alvo.url ? (alvo.semUrl || 'Ainda não tenho o endereço deste item no Onvio. Procure à mão com os dados acima.') : '';
    vp.innerHTML = `<div class="top"><span class="eti">${OLHO}Vendo no portal</span><button type="button" class="f" data-a="ficar" title="Esconde este quadro; a bolinha abre a extensão de novo">Ficar no Onvio</button></div>
      <div class="tit">${escH(alvo.titulo)}</div>
      <dl>${linhas}</dl>${alvo.mudanca ? `<p class="mud">${escH(alvo.mudanca)}</p>` : ''}
      <p class="st" aria-live="polite"></p>
      <div class="bts">${pendente ? '<button type="button" class="p" data-a="recarregar">Recarregar e mostrar</button>' : ''}${alvo.acao && !pendente ? `<button type="button" class="p" data-a="corrigir">${escH(alvo.acao)}</button>` : ''}<button type="button" data-a="voltar" title="Volta à mesma linha na extensão">Voltar</button></div>`;
    vp.hidden = false; b.hidden = true;
    if (aviso) estadoBusca('no', aviso + (alvo.copiado ? ' O nome já está copiado: Ctrl+V na busca do Onvio.' : ''));
    else if (alvo.destaque) { procurar(); laco = setInterval(procurar, 500); }
    else estadoBusca('ok', alvo.copiado ? 'O nome já está copiado: Ctrl+V na busca do Onvio.' : 'Esta é a tela do item no Onvio.');
    vp.querySelectorAll('[data-a]').forEach(x => x.addEventListener('click', e => {
      if (!e.isTrusted) return;          // só o clique de verdade da pessoa
      const acao = x.dataset.a, a = barra && barra.alvo; if (!a) return;
      if (acao === 'recarregar') { try { chrome.storage.local.set({ [ver.CHAVE_VER]: { alvo: a, em: Date.now() } }).then(() => location.assign(a.url)); } catch (e2) { location.assign(a.url); } return; }
      if (acao === 'ficar') return esconderBarra();
      abrir({ k: a.k, id: a.id, corrigir: acao === 'corrigir' });
    }));
    setTimeout(() => { const p = vp.querySelector('button.p') || vp.querySelector('[data-a="voltar"]'); try { p && p.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }, 50);
  }
  async function leituraAndando() {
    try { const e = (await chrome.storage.local.get('monitor-coleta-estado'))['monitor-coleta-estado']; return !!(e && e.estado === 'rodando' && Date.now() - e.em < 2 * 60 * 1000); } catch (x) { return false; }
  }
  async function verNoPortal(bruto) {
    if (!vivo()) return avisarOrfao();
    if (!ver) { try { ver = await import(chrome.runtime.getURL('src/ver-portal.js')); } catch (e) { return; } }
    const alvo = ver.alvoSeguro(bruto); if (!alvo) return;
    fechar();
    const modo = ver.comoNavegar(location.href, alvo.url);
    if (modo === 'abrir' && await leituraAndando()) return mostrarBarra(alvo, true);       // recarregar agora interromperia a leitura: a pessoa decide
    mostrarBarra(alvo);
    if (modo === 'hash') location.hash = new URL(alvo.url).hash;
    else if (modo === 'abrir') { try { await chrome.storage.local.set({ [ver.CHAVE_VER]: { alvo, em: Date.now() } }); } catch (e) { /* sem storage: a barra não volta depois da recarga */ } location.assign(alvo.url); }
  }
  // Depois da recarga que o "Ver no portal" pediu, a barra volta sozinha nesta página (até 2 min).
  import(chrome.runtime.getURL('src/ver-portal.js')).then(async m => {
    ver = m;
    const g = (await chrome.storage.local.get(m.CHAVE_VER))[m.CHAVE_VER];
    if (g && m.pedidoValeAqui(g, location.href)) { const a = m.alvoSeguro(g.alvo); if (a) mostrarBarra(a); }
  }).catch(() => { /* extensão atualizada */ });

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
    b.classList.toggle('lendo', e.estado === 'rodando');   // anel laranja enquanto lê
  }
  // A leitura do Onvio só começa em página do Onvio (no Gestta quem lê é src/gestta-auto.js).
  if (!NO_GESTTA) import(chrome.runtime.getURL('src/auto-coleta.js')).then(m => m.iniciar({ onEstado: estado })).catch(() => { /* leitura automática indisponível */ });
})();
