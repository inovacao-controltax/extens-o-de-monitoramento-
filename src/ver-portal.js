// "Ver no portal" (0.37.0; Josué, 27/11/2026: "ver no portal seria a extensão sair de cima do portal para o funcionário ver o que foi
// alterado antes de enviar a alteração"). Não abre outra aba: a camada sai da frente, o Onvio que está por baixo vai até o item e uma
// barra diz o que vai mudar, com Voltar e Voltar e corrigir. Aqui só as funções puras (sem chrome.*), usadas pela camada, pelo
// service worker, pelo painel e pelos testes: conferir o pedido, decidir como navegar e achar o nome do item no texto da tela.
export const TIPOS_VER = ['nomenclatura', 'pastas', 'semEnvio', 'envios', 'notificacoes'];
export const CHAVE_VER = 'monitor-ver';           // o pedido em andamento (sobrevive à recarga da página do Onvio), vale 2 min
export const VALIDADE_VER_MS = 2 * 60 * 1000;
// Notificações dos usuários do escritório (0.37.7; Josué, 27/11/2026: "ele tem que abrir o portal por baixo, ir em configurações, clicar na
// parte de notificações do escritório e achar o analista"). A rota settings/notifications do código antigo dá "Página não encontrada" no
// Onvio real; o caminho certo é o do menu. Começa por qualquer página do Portal do Cliente (todas têm o menu de cima, até a de erro).
export const PORTAL_INICIO = 'https://onvio.com.br/br-portal-do-cliente/';
export const ehPortal = pathname => /^\/br-portal-do-cliente(\/|$)/i.test(String(pathname || ''));
const semAcento = s => normalizar(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** O item "Configurações" do menu de cima do Portal do Cliente (só o texto exato, com ou sem a setinha). */
export const ehMenuConfig = t => /^configuracoes$/.test(semAcento(t).replace(/[^a-z]/g, ''));
/** O item do menu das notificações dos usuários do escritório ("Notificações do Escritório" e parecidos; nunca um texto longo). */
export const ehMenuNotif = t => { const v = semAcento(t); return v.length <= 80 && v.includes('notifica') && v.includes('escritorio'); };
/** A página de erro do Portal ("Página não encontrada", "Código do erro: 404"). */
export const ehPagina404 = t => /pagina nao encontrada|codigo do erro:?\s*404/.test(semAcento(String(t || '').slice(0, 5000)));
// Nome de pessoa na tela (0.37.10; Josué, 27/11/2026: "ele não achou o analista agora"): a lista do Onvio pode mostrar o nome com o do
// meio ("Clinton de Souza Lima"), em outra ordem ("LIMA, Clinton") ou sem acento. Vale quando todas as partes do nome procurado aparecem
// num texto curto (de, da, do… não contam).
const LIGA = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
export const partesDoNome = s => semAcento(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !LIGA.has(t));
export function casaNome(visivel, nome) {
  const v = semAcento(visivel).replace(/\s+/g, ' ').trim(), p = semAcento(nome).replace(/\s+/g, ' ').trim();
  if (!v || !p) return 0;
  if (v === p) return 2;
  const pp = partesDoNome(p), pv = new Set(partesDoNome(v));
  return pp.length >= 2 && v.length <= p.length + 60 && pp.every(t => pv.has(t)) ? 1 : 0;
}
/** Quantas partes do nome procurado um texto tem (para dizer o "mais parecido" quando não acha). */
export const partesEmComum = (visivel, nome) => { const pv = new Set(partesDoNome(visivel)); return partesDoNome(nome).filter(t => pv.has(t)).length; };
/** "Página 1 de 20" da paginação das grades do Onvio: { atual, total } (ou null). */
export function paginaDe(texto) {
  const m = /^p[aá]gina\s+(\d{1,4})\s+de\s+(\d{1,4})$/i.exec(String(texto || '').replace(/\s+/g, ' ').trim());
  if (!m) return null;
  const atual = +m[1], total = +m[2];
  return atual >= 1 && total >= atual && total <= 500 ? { atual, total } : null;
}
/** O rótulo "Ir a página" e o botão "Ir" da paginação. */
export const ehIrAPagina = t => /^ir a pagina$/.test(semAcento(t).replace(/\s+/g, ' ').trim());
export const ehBotaoIr = t => /^ir$/.test(semAcento(t).trim());
/** Campo de busca da tela (pela dica, pelo rótulo ou pelo nome do campo). */
export const ehCampoBusca = dica => /pesquis|busc|procur|filtr|nome/.test(semAcento(dica));
const txt = (v, max = 300) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Endereço do Onvio do escritório (https, onvio.com.br, nunca a visão do cliente); caminho solto vira endereço do onvio.com.br. */
export function urlDoOnvio(caminho) {
  const c = String(caminho || '').trim(); if (!c || c.length > 600) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(c) && !/^https:\/\//i.test(c)) return '';      // outro esquema (javascript:, http:, data:…) nunca
  let u; try { u = new URL(/^https?:/i.test(c) ? c : c.startsWith('/') ? 'https://onvio.com.br' + c : 'https://onvio.com.br/' + c); } catch (e) { return ''; }
  if (u.protocol !== 'https:' || !/(^|\.)onvio\.com\.br$/i.test(u.hostname) || u.username || u.password) return '';
  if (/^\/clientcenter(\/|$)/i.test(u.pathname)) return '';
  return u.href;
}

/** O pedido que vem do painel, conferido: só os campos conhecidos, só texto curto, endereço só do Onvio. */
export function alvoSeguro(a) {
  if (!a || typeof a !== 'object' || !TIPOS_VER.includes(a.k)) return null;
  const linhas = (Array.isArray(a.linhas) ? a.linhas : []).slice(0, 5)
    .map(l => (Array.isArray(l) ? [txt(l[0], 40), txt(l[1], 240)] : null)).filter(l => l && l[0] && l[1]);
  return { k: a.k, id: txt(a.id, 200), titulo: txt(a.titulo, 80), url: urlDoOnvio(a.url), linhas, mudanca: txt(a.mudanca, 240),
    destaque: txt(a.destaque, 200), acao: txt(a.acao, 40), semUrl: txt(a.semUrl, 240), copiado: a.copiado === true, roteiro: a.roteiro === 'notif' ? 'notif' : '' };
}

/** Como levar a página do Onvio ao endereço: 'ficar' (já está ou não há endereço), 'hash' (mesma página, sem recarregar) ou 'abrir'. */
export function comoNavegar(atual, destino) {
  if (!destino) return 'ficar';
  let a, d; try { a = new URL(atual); d = new URL(destino); } catch (e) { return 'ficar'; }
  if (a.href === d.href) return 'ficar';
  return a.origin === d.origin && a.pathname === d.pathname && a.search === d.search && d.hash ? 'hash' : 'abrir';
}

/** O pedido guardado ainda vale nesta página? (até 2 min depois e na mesma página do endereço; sem endereço, em qualquer página do Onvio) */
export function pedidoValeAqui(guardado, href, agora = Date.now()) {
  if (!guardado || !guardado.alvo || typeof guardado.em !== 'number' || agora - guardado.em > VALIDADE_VER_MS || agora < guardado.em - 5000) return false;
  const u = guardado.alvo.url; if (!u) return true;
  // mesma aplicação do Onvio (staff, br-portal-do-cliente…): a página pode completar ou trocar o resto do endereço ao abrir
  const app = p => p.split('/').filter(Boolean)[0] || '';
  try { const a = new URL(href), d = new URL(u); return a.origin === d.origin && app(a.pathname) === app(d.pathname); } catch (e) { return false; }
}

export const normalizar = s => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
/** O texto visível casa com o nome procurado? 2 = igual; 1 = contém (num texto curto) ou é o começo cortado com reticências; 0 = não. */
export function casaTexto(visivel, procurado) {
  const v = normalizar(visivel), p = normalizar(procurado);
  if (!p || !v) return 0;
  if (v === p) return 2;
  if (v.includes(p)) return v.length <= p.length + 40 ? 1 : 0;          // nome com data, tamanho ou ícone ao lado; nunca no meio de um parágrafo
  const semExt = p.replace(/\.[a-z0-9]{1,5}$/i, '');                       // o Onvio pode mostrar o nome sem a extensão (".zip", ".pdf")
  if (semExt !== p && semExt.length >= 4 && v.includes(semExt) && v.length <= semExt.length + 40) return 1;
  const corte = v.replace(/\s*(…|\.\.\.)$/, '');
  if (corte !== v && corte.length >= 8 && p.startsWith(corte)) return 1;
  return 0;
}

/** Volta da camada para a extensão: a lista e a linha de onde a pessoa saiu (e se ela quer corrigir). */
export function voltaDaUrl(search) {
  const q = new URLSearchParams(search || ''); const k = q.get('volta');
  return TIPOS_VER.includes(k) ? { k, id: txt(q.get('linha') || '', 200), corrigir: q.get('corrigir') === '1' } : null;
}
export function voltaSegura(m) {
  return m && TIPOS_VER.includes(m.k) ? { k: m.k, id: txt(m.id, 200), corrigir: m.corrigir === true } : null;
}
