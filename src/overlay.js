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
    /* 0.37.3 (Josué, 27/11/2026: "o control onvio não é uma bolinha, é um retângulo com pontas arredondadas que parece sair da tela"): a aba do
       Control Onvio, presa na borda direita (parada, só a marca à vista; com o mouse, desliza para fora e diz o estado; a faixa da esquerda segue a
       situação), com as cores trocadas ("branco com o fundo preto"): aba branca e a marca no círculo preto. Arrasta só para cima e para baixo. */
    #b{--faixa:#6BAAC9;pointer-events:auto;position:fixed;right:0;bottom:24px;height:48px;display:flex;align-items:center;gap:10px;padding:0 16px 0 8px;border:0;border-radius:14px 0 0 14px;background:#fff;color:#101820;cursor:pointer;text-align:left;font:inherit;touch-action:none;box-shadow:-3px 4px 14px rgba(16,24,32,.28),inset 0 0 0 1px rgba(16,24,32,.12);transform:translateX(calc(100% - 52px));transition:transform .22s ease,box-shadow .15s ease}
    #b::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--faixa)}
    #b:hover,#b:focus-visible,#b.mostra,#b.arr{transform:translateX(0);box-shadow:-6px 8px 22px rgba(16,24,32,.34),inset 0 0 0 1px rgba(16,24,32,.12)}
    #b.lendo{--faixa:#B5530C} #b.novas{--faixa:#C2000C}
    #b .mk{position:relative;flex:none;width:34px;height:34px;border-radius:50%;background:#0E151B;display:grid;place-items:center;pointer-events:none}
    #b img{width:17px;height:21px;display:block}
    #b .tx{display:flex;flex-direction:column;gap:1px;line-height:1.2;white-space:nowrap;pointer-events:none}
    #b .tx b{font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;color:#101820}
    #b .tx small{font:500 11.5px system-ui,-apple-system,"Segoe UI",sans-serif;color:#47545F}
    #n{position:absolute;top:-7px;left:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#C2000C;color:#fff;font:700 11.5px/18px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff}
    #n[hidden]{display:none}
    #b:focus-visible{outline:2px solid #6BAAC9;outline-offset:2px} #b.arr{cursor:grabbing}
    @media (prefers-reduced-motion:reduce){#b{transition:none}}
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
  <button id="b" type="button" aria-label="Abrir o Hub de Monitoramento" title="Hub de Monitoramento (Alt+Shift+M)"><span class="mk"><img alt="" src="${chrome.runtime.getURL('hub/logo.svg')}"><span id="n" hidden></span></span><span class="tx"><b>Monitoramento</b><small id="bs">Portal do Cliente</small></span></button>
  <div id="v" hidden role="dialog" aria-modal="true" aria-label="Hub de Monitoramento do Portal"><div id="av" hidden role="alert"><span id="avt"></span><button type="button" id="avr">Recarregar a página</button><button type="button" id="avf" class="s">Fechar</button></div></div>
  <div id="hl" hidden></div><section id="vp" hidden aria-label="Vendo no portal"></section>`;
  document.documentElement.appendChild(host);
  const b = root.getElementById('b'), v = root.getElementById('v'), nBadge = root.getElementById('n'), av = root.getElementById('av'), vp = root.getElementById('vp'), hl = root.getElementById('hl');
  let frame = null, ultimoBatimento = 0, abertoEm = 0, vigia = null;
  // Depois de a extensão ser atualizada ou recarregada com esta página aberta, este script fica "órfão": o endereço do painel deixa de existir
  // e o Chrome mostra "Este arquivo pode ter sido movido, editado ou excluído". Em vez disso, avisa e oferece recarregar a página.
  const vivo = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  // "Ver no portal" das notificações: o Onvio não informa o endereço da tela de notificações dos usuários do escritório. A extensão aprende
  // pelo pedido que SÓ essa tela faz ao abrir um funcionário: a configuração do BOX-e dele (boxe/v1/contact-notifications/{contato}; a extensão
  // nunca faz esse pedido). Vê só o ENDEREÇO dos recursos que a própria página carregou (Resource Timing), nunca o conteúdo nem a resposta.
  // Guarda o endereço da tela sem identificadores e, se o endereço tiver o contato aberto, um modelo que abre direto a tela de cada funcionário.
  // (0.37.4: antes aprendia por "notifica" no endereço, que podia pegar outra tela do Onvio; a chave antiga é deixada de lado.)
  const semIds = h => h.replace(/\/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?=[/?#]|$)/gi, '').replace(/\/[0-9a-f]{24,32}(?=[/?#]|$)/gi, '');
  const RX_BOXE = /\/api\/boxe\/v1\/contact-notifications\/([0-9a-z-]{6,64})(?=[/?#]|$)/i;
  let ultimoBoxe = '';
  function aprenderNotif(recurso) {
    const m = RX_BOXE.exec(recurso || ''); if (!m || !vivo() || NO_GESTTA) return;
    const contato = m[1].toLowerCase(), href = location.href, chave = contato + '|' + href;
    if (chave === ultimoBoxe) return; ultimoBoxe = chave;
    const pos = href.toLowerCase().indexOf(contato);
    const pessoa = pos >= 0 ? href.slice(0, pos) + '{contato}' + href.slice(pos + contato.length) : '';
    try { chrome.storage.local.set({ 'monitor-url-notif2': { url: semIds(href), pessoa, em: Date.now() } }); } catch (e) { /* extensão atualizada: a página antiga não grava */ }
  }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) aprenderNotif(e.name); }).observe({ type: 'resource', buffered: true }); } catch (e) { /* navegador sem Resource Timing */ }
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

  // Clique de verdade (nunca um clique forjado pela página) abre; arrastar só muda a altura (a aba fica sempre na borda direita).
  let arr = null;
  const altura = v => Math.max(4, Math.min(innerHeight - 52, v));
  b.addEventListener('pointerdown', e => { if (!e.isTrusted) return; arr = { x: e.clientX, y: e.clientY, bt: innerHeight - b.getBoundingClientRect().bottom, mov: false }; b.setPointerCapture(e.pointerId); });
  b.addEventListener('pointermove', e => {
    if (!arr) return;
    const dy = e.clientY - arr.y;
    if (!arr.mov && Math.hypot(e.clientX - arr.x, dy) < 5) return;
    arr.mov = true; b.classList.add('arr');
    b.style.bottom = altura(arr.bt - dy) + 'px';
  });
  b.addEventListener('pointerup', e => {
    const moveu = arr && arr.mov; b.classList.remove('arr'); arr = null;
    if (moveu) { try { chrome.storage.local.set({ posBolinhaMonitor: { bottom: b.style.bottom } }); } catch (x) { /* sem storage */ } return; }
    if (e.isTrusted) abrir();
  });
  b.addEventListener('pointercancel', () => { b.classList.remove('arr'); arr = null; });
  b.addEventListener('keydown', e => { if (e.isTrusted && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); } });
  try { chrome.storage.local.get('posBolinhaMonitor').then(r => { const p = r && r.posBolinhaMonitor, y = p && parseFloat(p.bottom); if (y >= 0) b.style.bottom = altura(y) + 'px'; }); } catch (e) { /* sem storage */ }

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
  // Achado o item (ou desistindo de procurar), o pedido guardado para depois da recarga acaba: outras páginas não mostram o quadro de novo.
  function consumirPedido() { if (!ver || !barra || barra.consumido) return; barra.consumido = true; try { chrome.storage.local.remove(ver.CHAVE_VER); } catch (e) { /* extensão atualizada */ } }
  function estadoBusca(cls, texto) {
    if (cls === 'ok' || cls === 'no') consumirPedido();
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
  function mostrarBarra(alvo, indo = false) {
    if (laco) { clearInterval(laco); laco = null; }
    barra = { alvo, el: null, t0: Date.now(), rolou: false };
    const linhas = alvo.linhas.map(([r, x]) => `<dt>${escH(r)}</dt><dd title="${escH(x)}">${escH(x)}</dd>`).join('');
    const aviso = !alvo.url ? (alvo.semUrl || 'Ainda não tenho o endereço deste item no Onvio. Procure à mão com os dados acima.') : '';
    vp.innerHTML = `<div class="top"><span class="eti">${OLHO}Vendo no portal</span><button type="button" class="f" data-a="ficar" title="Esconde este quadro; a bolinha abre a extensão de novo">Ficar no Onvio</button></div>
      <div class="tit">${escH(alvo.titulo)}</div>
      <dl>${linhas}</dl>${alvo.mudanca ? `<p class="mud">${escH(alvo.mudanca)}</p>` : ''}
      <p class="st" aria-live="polite"></p>
      <div class="bts">${alvo.acao ? `<button type="button" class="p" data-a="corrigir">${escH(alvo.acao)}</button>` : ''}<button type="button" data-a="voltar" title="Volta à mesma linha na extensão">Voltar</button></div>`;
    vp.hidden = false; b.hidden = true;
    if (indo) estadoBusca('', 'Abrindo no Onvio…');          // a página vai recarregar: procura só depois, na página nova
    else if (aviso) estadoBusca('no', aviso + (alvo.copiado ? ' O nome já está copiado: Ctrl+V na busca do Onvio.' : ''));
    else if (alvo.roteiro === 'notif') { if (ver.ehPortal(location.pathname)) roteiroNotif(alvo); else estadoBusca('', 'Abrindo o Portal do Cliente…'); }
    else if (alvo.destaque) { procurar(); laco = setInterval(procurar, 500); }
    else estadoBusca('ok', alvo.copiado ? 'O nome já está copiado: Ctrl+V na busca do Onvio.' : 'Esta é a tela do item no Onvio.');
    vp.querySelectorAll('[data-a]').forEach(x => x.addEventListener('click', e => {
      if (!e.isTrusted) return;          // só o clique de verdade da pessoa
      const acao = x.dataset.a, a = barra && barra.alvo; if (!a) return;
      if (acao === 'ficar') return esconderBarra();
      abrir({ k: a.k, id: a.id, corrigir: acao === 'corrigir' });
    }));
    setTimeout(() => { const p = vp.querySelector('button.p') || vp.querySelector('[data-a="voltar"]'); try { p && p.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }, 50);
  }
  // ---- Roteiro das notificações (0.37.7; Josué, 27/11/2026: "ele tem que abrir o portal por baixo, ir em configurações, clicar na parte de
  // notificações do escritório e achar o analista") ----
  // Só cliques de NAVEGAÇÃO, e só em dois itens do menu do Portal do Cliente achados pelo texto exato ("Configurações" e o item de
  // Notificações do Escritório, src/ver-portal.js); nada é marcado, salvo nem enviado. Depois do menu, guarda o endereço verdadeiro da tela
  // (monitor-url-notif2) para a próxima vez ir direto. Na tela: o contorno no funcionário; se ele não aparece, escreve o nome na busca da
  // própria tela (só preenche o campo, não aperta nenhum botão).
  let roteiroId = 0;
  const visivelEl = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const textoEl = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  function acharItem(teste) {
    let melhor = null;
    for (const el of document.querySelectorAll('a, button, [role="menuitem"], [role="tab"], li, span')) {
      if (host.contains(el)) continue;
      const t = textoEl(el); if (!t || t.length > 90 || !teste(t) || !visivelEl(el)) continue;
      if (!melhor || melhor.contains(el)) melhor = el;           // o mais de dentro que casa: o próprio item, não o menu inteiro
    }
    return melhor ? (melhor.closest('a, button, [role="menuitem"], [role="tab"]') || melhor) : null;
  }
  function clicarNavegacao(el) {
    for (const t of ['mouseover', 'mouseenter']) el.dispatchEvent(new MouseEvent(t, { bubbles: t === 'mouseover', cancelable: true, view: window }));
    el.click();
  }
  function acharCampoBusca() {
    for (const el of document.querySelectorAll('input')) {
      if (host.contains(el) || !visivelEl(el) || el.disabled || el.readOnly) continue;
      const tipo = (el.getAttribute('type') || 'text').toLowerCase(); if (tipo !== 'text' && tipo !== 'search') continue;
      if (ver.ehCampoBusca([el.placeholder, el.getAttribute('aria-label'), el.name, el.id, el.title].filter(Boolean).join(' '))) return el;
    }
    return null;
  }
  function preencherBusca(campo, valor) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    campo.focus(); set.call(campo, valor);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: valor.slice(-1) }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function procurarFuncionario(alvo, ativo) {
    if (!ativo()) return;
    if (laco) clearInterval(laco);
    barra.t0 = Date.now(); barra.el = null; barra.rolou = false;
    procurar(); laco = setInterval(procurar, 500);
    setTimeout(() => {      // não apareceu em 4 s (lista longa ou paginada): escreve o nome na busca da própria tela
      if (!ativo() || !barra || barra.el) return;
      const campo = acharCampoBusca(); if (!campo) return;
      preencherBusca(campo, alvo.destaque); barra.t0 = Date.now();
    }, 4000);
  }
  async function roteiroNotif(alvo) {
    const id = ++roteiroId, ativo = () => !!barra && barra.alvo === alvo && id === roteiroId;
    const espera = ms => new Promise(r => setTimeout(r, ms));
    const ate = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (!ativo()) return null; const x = fn(); if (x) return x; await espera(300); } return null; };
    const e404 = () => ver.ehPagina404(document.body ? document.body.innerText : '');
    const caminho = u => { try { return new URL(u).pathname.replace(/\/+$/, ''); } catch (e) { return '?'; } };
    let aprendido = null; try { aprendido = (await chrome.storage.local.get('monitor-url-notif2'))['monitor-url-notif2'] || null; } catch (e) { /* sem storage */ }
    const aqui = () => location.pathname.replace(/\/+$/, '');
    const naTela = () => (alvo.url !== ver.PORTAL_INICIO && aqui() === caminho(alvo.url)) || (aprendido && aprendido.url && aqui() === caminho(aprendido.url));
    estadoBusca('', 'Abrindo o Portal do Cliente…');
    const cfg = await ate(() => acharItem(ver.ehMenuConfig), 20000);
    if (!ativo()) return;
    if (naTela()) {          // o endereço aprendido: procura o funcionário e vigia a página; deu "Página não encontrada", volta pelo menu
      procurarFuncionario(alvo, ativo);
      const r = await ate(() => (e404() ? 'erro' : barra && barra.el ? 'achou' : null), 6000);
      if (r !== 'erro') return;
      if (laco) { clearInterval(laco); laco = null; }
    }
    if (!cfg) return estadoBusca('no', 'Não achei o menu Configurações do Portal do Cliente. Abra Configurações › Notificações do Escritório e procure pelo nome (já copiado).');
    estadoBusca('', 'Abrindo Configurações…');
    let item = acharItem(ver.ehMenuNotif);
    if (!item) { clicarNavegacao(cfg); item = await ate(() => acharItem(ver.ehMenuNotif), 5000); }
    if (!ativo()) return;
    if (!item) return estadoBusca('no', 'Abri Configurações, mas não achei as notificações do escritório. Clique nelas e procure pelo nome (já copiado).');
    estadoBusca('', `Abrindo ${textoEl(item)}…`);
    const antes = location.href; clicarNavegacao(item);
    await ate(() => location.href !== antes, 5000); await espera(500);
    if (!ativo()) return;
    if (location.href !== antes && !e404()) {        // guarda o endereço verdadeiro da tela: da próxima vez vai direto
      const pessoa = aprendido && aprendido.pessoa && caminho(aprendido.url) === aqui() ? aprendido.pessoa : '';
      try { chrome.storage.local.set({ 'monitor-url-notif2': { url: semIds(location.href), pessoa, em: Date.now(), fonte: 'menu' } }); } catch (e) { /* sem storage */ }
    }
    estadoBusca('', 'Procurando na tela do Onvio…');
    procurarFuncionario(alvo, ativo);
  }
  async function verNoPortal(bruto) {
    if (!vivo()) return avisarOrfao();
    if (!ver) { try { ver = await import(chrome.runtime.getURL('src/ver-portal.js')); } catch (e) { return; } }
    const alvo = ver.alvoSeguro(bruto); if (!alvo) return;
    fechar();
    // notificações sem endereço aprendido e já no Portal do Cliente: não recarrega, vai pelo menu desta página mesmo
    const modo = alvo.roteiro === 'notif' && ver.ehPortal(location.pathname) && alvo.url === ver.PORTAL_INICIO ? 'ficar' : ver.comoNavegar(location.href, alvo.url);
    // vai direto, sem perguntar (Josué, 27/11/2026: "nada ainda"): se uma leitura estava andando nesta aba, ela solta a vez ao sair e recomeça depois
    mostrarBarra(alvo, modo === 'abrir');
    if (modo === 'hash') location.hash = new URL(alvo.url).hash;
    else if (modo === 'abrir') { try { await chrome.storage.local.set({ [ver.CHAVE_VER]: { alvo, em: Date.now() } }); } catch (e) { /* sem storage: a barra não volta depois da recarga */ } location.assign(alvo.url); }
  }
  // Depois da recarga que o "Ver no portal" pediu, a barra volta sozinha nesta página (até 2 min).
  import(chrome.runtime.getURL('src/ver-portal.js')).then(async m => {
    ver = m;
    const g = (await chrome.storage.local.get(m.CHAVE_VER))[m.CHAVE_VER];
    if (g && m.pedidoValeAqui(g, location.href)) { const a = m.alvoSeguro(g.alvo); if (a) mostrarBarra(a); }
  }).catch(() => { /* extensão atualizada */ });

  // A aba diz o estado (como a do Control Onvio): número de pendências NOVAS ainda não vistas (histórico, fase 6; só mostra, quem marca como vista
  // é o painel) e a leitura em andamento. Faixa da esquerda: vermelha com novas, laranja lendo, azul em dia. Novas chegando: a aba sai por 4 s.
  const sub = root.getElementById('bs'), dica = 'Hub de Monitoramento (Alt+Shift+M)';
  let nNovas = null, lendo = false, msgLeitura = '', tMostra = null;
  const plural = (n, a, b2) => `${n > 99 ? '99+' : n} ${n === 1 ? a : b2}`;
  function atualizarAba() {
    const n = nNovas || 0;
    b.classList.toggle('novas', n > 0); b.classList.toggle('lendo', lendo && !n);
    nBadge.hidden = !n; nBadge.textContent = n > 99 ? '99+' : String(n);
    sub.textContent = n ? plural(n, 'pendência nova', 'pendências novas') + (lendo ? ' · lendo…' : '') : lendo ? 'Lendo o Onvio…' : 'Portal do Cliente';
    b.title = `${dica}${n ? `\n${plural(n, 'pendência nova', 'pendências novas')}` : ''}${msgLeitura ? `\n${msgLeitura}` : ''}`;
  }
  const marcaNovas = h => {
    const n = ((h && h.novas) || []).filter(x => !x.visto).length, antes = nNovas;
    nNovas = n; atualizarAba();
    if (antes !== null && n > antes && !matchMedia('(prefers-reduced-motion: reduce)').matches) { b.classList.add('mostra'); clearTimeout(tMostra); tMostra = setTimeout(() => b.classList.remove('mostra'), 4000); }
  };
  try {
    chrome.storage.local.get('monitor-historico').then(r => marcaNovas(r['monitor-historico']));
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch['monitor-historico']) marcaNovas(ch['monitor-historico'].newValue); });
  } catch (e) { /* sem storage */ }
  // Leitura automática do Onvio em segundo plano (sem clique). O andamento aparece na aba (faixa laranja e "Lendo o Onvio…") e na dica.
  function estado(e) {
    lendo = e.estado === 'rodando';
    msgLeitura = e.estado === 'rodando' ? `Lendo o Onvio: ${e.msg || ''}` : e.estado === 'ok' ? (e.msg || '') : e.estado === 'cliente' ? '' : `Leitura: ${e.msg || e.estado}`;
    atualizarAba();
  }
  // A leitura do Onvio só começa em página do Onvio (no Gestta quem lê é src/gestta-auto.js).
  if (!NO_GESTTA) import(chrome.runtime.getURL('src/auto-coleta.js')).then(m => m.iniciar({ onEstado: estado })).catch(() => { /* leitura automática indisponível */ });
})();
