// Correção das notificações fora do padrão: colocar a configuração de "Solicitações de Serviço" do funcionário igual à do usuário modelo.
// Mapeado em 27/11/2026 pelo modo aprender (SALVAR na tela de notificações): o Onvio grava o mesmo corpo em
//   PUT service-requesting/v1/contact-notifications/{contato}  e  PUT br-payroll-sr/v1/contact-notifications/{contato}
// com as 12 opções abaixo (todas sim/não). As outras seções da tela (CND, BOX-e, documentos, OnBalance) são outras gravações e não são tocadas.
// Travas: lista fechada (só esses dois PUT, só as 12 opções, só sim/não); relê a configuração antes e só grava se ainda estiver diferente;
// um funcionário por vez; para na primeira recusa 401/403 e depois de 3 erros seguidos; guarda a configuração anterior para desfazer.
import { API } from './onvio-reader.js';

export const OPCOES_NOTIF = ['newTicketEmail', 'newTicketSystem', 'newTopicEmail', 'newTopicEmailAllContacts', 'newTopicSystem', 'newTopicSystemAllContacts',
  'completedTopicEmail', 'completedTopicEmailAllContacts', 'completedTopicSystem', 'completedTopicSystemAllContacts', 'forwardedTopicEmail', 'forwardedTopicEmailAllContacts'];
const SERVICOS = ['service-requesting', 'br-payroll-sr'];
const ID = '[0-9a-fA-F-]{8,40}';
const ROTA = new RegExp(`^(${SERVICOS.join('|')})/v1/contact-notifications/(${ID})$`);

/** As 12 opções do padrão, tiradas da configuração lida do modelo; null se faltar alguma (aí não dá para corrigir com segurança). */
export function corpoDoPadrao(campos) {
  if (!campos) return null;
  const c = {};
  for (const k of OPCOES_NOTIF) { if (typeof campos[k] !== 'boolean') return null; c[k] = campos[k]; }
  return c;
}
export const pedidoNotif = (servico, contato, corpo) => ({ metodo: 'PUT', url: `${API}${servico}/v1/contact-notifications/${encodeURIComponent(contato)}`, corpo: { ...corpo } });
export const urlNotif = contato => `${API}service-requesting/v1/contact-notifications/${encodeURIComponent(contato)}`;

/** Lista fechada: só os dois PUT, só no onvio.com.br, corpo com exatamente as 12 opções, todas sim/não. */
export function notifPermitida(p) {
  if (!p || p.metodo !== 'PUT' || typeof p.url !== 'string') return false;
  let u; try { u = new URL(p.url); } catch (e) { return false; }
  if (u.origin !== 'https://onvio.com.br' || !u.pathname.startsWith('/api/') || u.search) return false;
  if (!ROTA.test(decodeURIComponent(u.pathname.slice(5)))) return false;
  const c = p.corpo; if (!c || typeof c !== 'object') return false;
  const ks = Object.keys(c);
  return ks.length === OPCOES_NOTIF.length && OPCOES_NOTIF.every(k => typeof c[k] === 'boolean');
}

export const MOTIVOS_NOTIF = {
  'ja-no-padrao': 'Já estava no padrão quando foi conferido; não foi alterado',
  'sem-contato': 'Sem identificador do funcionário (leia as notificações de novo)',
  'sem-config': 'O funcionário não tem configuração salva (já aparece com o padrão)',
  'recusado': 'O Onvio recusou',
  'parcial': 'Gravou nas Solicitações, mas o Onvio recusou nas listas da folha',
  'sem-permissao': 'O Onvio recusou por falta de permissão (401/403): parei',
};
const dorme = ms => new Promise(r => setTimeout(r, ms));
const igual = (a, b) => OPCOES_NOTIF.every(k => a[k] === b[k]);

/**
 * Coloca cada funcionário no padrão, um por vez. itens: [{ nome, contato }]. alvo: as 12 opções do padrão.
 * `ler(url)` devolve o JSON; `escrever(pedido)` devolve { status }. Devolve { feitos: [{ nome, contato, antes, depois }], falhas, parou }.
 */
export async function corrigirNotificacoes(itens, alvo, { ler, escrever, parar, onProgresso, pausaMs = 250 } = {}) {
  const feitos = [], falhas = []; let parou = '', seguidos = 0, n = 0;
  if (!alvo || !OPCOES_NOTIF.every(k => typeof alvo[k] === 'boolean')) return { feitos, falhas: itens.map(i => ({ ...i, motivo: 'sem-config' })), parou: 'sem-padrao' };
  for (const it of itens) {
    if (parar && parar()) { parou = 'pedido'; break; }
    n++;
    const falha = motivo => falhas.push({ ...it, motivo });
    if (!it.contato) { falha('sem-contato'); continue; }
    let antes;
    try {
      const d = await ler(urlNotif(it.contato)), x = (d && (d.data || d)) || {};
      antes = {}; for (const k of OPCOES_NOTIF) antes[k] = x[k];
      if (!OPCOES_NOTIF.every(k => typeof antes[k] === 'boolean')) { falha('sem-config'); continue; }
      if (igual(antes, alvo)) { falha('ja-no-padrao'); continue; }
    } catch (e) { falha('sem-config'); continue; }
    let ok = 0, negado = false;
    for (const s of SERVICOS) {
      const p = pedidoNotif(s, it.contato, alvo);
      if (!notifPermitida(p)) break;
      const r = await escrever(p);
      if (r && r.status >= 200 && r.status < 300) ok++;
      else { if (r && (r.status === 401 || r.status === 403)) negado = true; break; }
    }
    if (ok === SERVICOS.length) { feitos.push({ nome: it.nome, contato: it.contato, antes, depois: { ...alvo } }); seguidos = 0; }
    else if (ok > 0) { feitos.push({ nome: it.nome, contato: it.contato, antes, depois: { ...alvo }, parcial: true }); falha('parcial'); }
    else if (negado) { falha('sem-permissao'); parou = 'sem-permissao'; break; }
    else { falha('recusado'); if (++seguidos >= 3) { parou = 'erros'; break; } }
    if (onProgresso) onProgresso({ feito: n, total: itens.length, ok: feitos.length });
    if (pausaMs) await dorme(pausaMs);
  }
  return { feitos, falhas, parou };
}

/** Desfaz: volta cada funcionário à configuração de antes, um por vez, só se ainda estiver como a extensão deixou. */
export async function desfazerNotificacoes(feitos, { ler, escrever, parar, pausaMs = 250 } = {}) {
  const res = { feitos: [], falhas: [], parou: '' };
  for (const f of feitos.slice().reverse()) {
    if (parar && parar()) { res.parou = 'pedido'; break; }
    let atual; try { const d = await ler(urlNotif(f.contato)); atual = (d && (d.data || d)) || {}; } catch (e) { res.falhas.push({ ...f, motivo: 'sem-config' }); continue; }
    if (!igual(atual, f.depois)) { res.falhas.push({ ...f, motivo: 'ja-no-padrao' }); continue; }
    let ok = true;
    for (const s of SERVICOS) { const p = pedidoNotif(s, f.contato, f.antes); if (!notifPermitida(p)) { ok = false; break; } const r = await escrever(p); if (!(r && r.status >= 200 && r.status < 300)) { ok = false; if (r && (r.status === 401 || r.status === 403)) res.parou = 'sem-permissao'; break; } }
    if (ok) res.feitos.push({ nome: f.nome, contato: f.contato }); else res.falhas.push({ ...f, motivo: 'recusado' });
    if (res.parou) break;
    if (pausaMs) await dorme(pausaMs);
  }
  return res;
}
