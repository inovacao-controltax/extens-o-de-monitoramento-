// Regras de verificação (Fase 3). Funções puras: recebem dados brutos + configuração e devolvem listas de pendências.
// Formato dos dados brutos (o mesmo que as coletas reais das Fases 4 e 5 vão produzir):
//   docs:  [{ empresa, cnpj, pasta: 'Fiscal/2026/11', arquivo, data: 'AAAA-MM-DD', origem: 'cliente'|'escritorio' }]
//   users: [{ nome, setor, email, notificaTarefa: boolean, tarefasAtivas: number }]
import { SETORES, compilePattern, normalizeCnpj, chaveDoGrupo, raizesDoGrupo } from './config.js';

const DAY = 864e5;
const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const topFolder = pasta => String(pasta ?? '').split('/').map(s => s.trim()).filter(Boolean)[0] || '';
const utcDay = iso => { const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`); return Number.isNaN(t) ? null : t; };
const today = now => utcDay(now.toISOString());
const daysSince = (iso, now) => { const t = utcDay(iso); return t === null ? null : Math.floor((today(now) - t) / DAY); };

/** Setor da empresa a partir da pasta de primeiro nível ("Outro" se não for um dos 4 setores). */
export function setorDaPasta(pasta) {
  const top = norm(topFolder(pasta));
  return SETORES.find(s => norm(s) === top) || 'Outro';
}

/** Arquivos enviados pelo cliente cujo nome não bate com o padrão. Arquivos do escritório são ignorados. */
export function checkNomenclatura(docs, cfg) {
  const { re } = compilePattern(cfg.filePattern);
  if (!re) return [];
  return docs.filter(d => d.origem === 'cliente' && !re.test(String(d.arquivo ?? '').trim()))
    .map(d => ({ empresa: d.empresa, cnpj: d.cnpj, setor: setorDaPasta(d.pasta), pasta: d.pasta, arquivo: d.arquivo, data: d.data }));
}

/** Empresas com pasta de primeiro nível fora da lista permitida (uma linha por empresa e pasta). */
export function checkPastas(docs, cfg) {
  const ok = new Set(cfg.allowedFolders.map(norm));
  const grupos = new Map();
  for (const d of docs) {
    const top = topFolder(d.pasta);
    if (!top || ok.has(norm(top))) continue;
    const k = `${d.cnpj}|${norm(top)}`;
    const g = grupos.get(k) || { empresa: d.empresa, cnpj: d.cnpj, pasta: top, arquivos: 0 };
    if (d.arquivo) g.arquivos++;
    grupos.set(k, g);
  }
  return [...grupos.values()].sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
}

/**
 * Clientes treinados sem envio. Referência = último envio do cliente; se nunca enviou, a data do treinamento
 * (carência: quem acabou de ser treinado ainda não está atrasado). Sem nenhuma das duas datas, entra como "nunca enviou".
 * dias === null significa "nunca enviou nada".
 */
/** Raiz do CNPJ (8 primeiros dígitos): matriz e filiais são uma empresa só (regra do Hub). O Hub e o Onvio podem cadastrar estabelecimentos diferentes do mesmo grupo. */
const raizReal = c => { const n = normalizeCnpj(c); return n.length >= 8 ? n.slice(0, 8) : n; };
/** Chave da empresa: a raiz do CNPJ, ou a raiz-chave do grupo quando a empresa faz parte de um grupo (Atacapet + RB + YB). */
export const raizDoCnpj = c => chaveDoGrupo(raizReal(c));

/**
 * Demanda da empresa segundo o Hub (que sabe, pelo Gestta, em quais setores ela tem tarefa): `mapa` = { raiz: ['Pessoal', ...] }.
 * comDemanda: true / false / null (o Hub não conhece a empresa ou ainda não se puxou a demanda: nunca se presume "sem demanda").
 */
export function demandaDe(mapa, cnpj) {
  const m = mapa && typeof mapa === 'object' ? mapa : null;
  const ls = m ? raizesDoGrupo(raizReal(cnpj)).map(r => m[r]).filter(Array.isArray) : [];      // o grupo todo: demanda em qualquer empresa dele vale
  if (!ls.length) return { comDemanda: null, setoresDemanda: [] };
  const l = [...new Set(ls.flat())];
  return { comDemanda: l.length > 0, setoresDemanda: l };
}

/** Situação de TODAS as treinadas: dias desde a última atividade do cliente (arquivo ou Solicitação), de onde veio, ou null se não há registro. */
export function statusEnvio(docs, trained, now = new Date(), solic = {}, demanda = null) {
  const ultimo = new Map(), fonte = new Map();
  const marca = (cnpj, t, f) => { const k = raizDoCnpj(cnpj); if (!ultimo.has(k) || t > ultimo.get(k)) { ultimo.set(k, t); fonte.set(k, f); } };
  for (const d of docs) {
    if (d.origem !== 'cliente') continue;
    const t = utcDay(d.data); if (t === null) continue;
    marca(d.cnpj, t, 'arquivo');
  }
  // Solicitações de Serviço: qualquer ação do cliente (abrir, responder, lançar rubrica) mostra que ele usa o portal. { cnpj: 'AAAA-MM-DD' }
  for (const [cnpj, iso] of Object.entries(solic || {})) { const t = utcDay(iso); if (t !== null) marca(cnpj, t, 'solicitação'); }
  const feitos = new Set();      // treinadas do mesmo grupo (Atacapet, RB, YB) são uma empresa só: a primeira vale
  return trained.filter(t => { const k = raizDoCnpj(t.cnpj); if (feitos.has(k)) return false; feitos.add(k); return true; }).map(t => {
    const k = raizDoCnpj(t.cnpj), last = ultimo.get(k);
    const dias = last === undefined ? null : Math.floor((today(now) - last) / DAY);
    return { empresa: t.empresa, cnpj: t.cnpj, treinadoEm: t.treinadoEm, demanda: t.demanda || [], dias, fonte: dias === null ? '' : fonte.get(k), ...demandaDe(demanda, t.cnpj) };
  });
}

export function checkSemEnvio(docs, trained, cfg, now = new Date(), solic = {}, demanda = null) {
  const out = [];
  for (const r of statusEnvio(docs, trained, now, solic, demanda)) {
    if (r.comDemanda === false) continue;      // sem demanda em nenhum setor (segundo o Hub): não há o que enviar, não é alerta
    const ref = r.dias !== null ? r.dias : (r.treinadoEm ? daysSince(r.treinadoEm, now) : null);
    if (ref === null || ref > cfg.diasSemEnvio) out.push(r);
  }
  return out.sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity));
}

/** Empresas silenciadas agora: { cnpj, ate: 'AAAA-MM-DD' | '' (sem data), motivo }. Vencida a data, a empresa volta a ser acompanhada. */
export const silenciadaAgora = (s, now = new Date()) => !!s && (!s.ate || utcDay(s.ate) === null || utcDay(s.ate) >= today(now));

/** Funcionários com o aviso de tarefa nova desligado e que têm tarefas ativas. */
export function checkNotificacoes(users) {
  return users.filter(u => u.notificaTarefa === false && u.tarefasAtivas !== 0)
    .map(u => ({ nome: u.nome, setor: u.setor, email: u.email, tarefasAtivas: u.tarefasAtivas }))
    .sort((a, b) => (b.tarefasAtivas ?? 0) - (a.tarefasAtivas ?? 0));
}

/**
 * Funcionários do escritório sem aviso de "nova Solicitação de Serviço" (e-mail e sistema desligados), lidos do Onvio.
 * Sem configuração salva (404) só entra se cfg.notifPadraoDesligado. Configuração lida sem os campos reconhecidos não entra.
 */
export function checkNotificacoesOnvio(notif, cfg = {}) {
  const out = [];
  for (const u of (notif && notif.itens) || []) {
    if (u.estado === 'configurado' && u.email === false && u.sistema === false) out.push({ nome: u.nome, motivo: 'E-mail e sistema desligados', situacao: 'desligado' });
    else if (u.estado === 'padrao' && cfg.notifPadraoDesligado) out.push({ nome: u.nome, motivo: 'Sem configuração salva (padrão do Onvio)', situacao: 'padrao' });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Se a configuração não tem clientes treinados, usa os do snapshot (dados de exemplo). */
export function analyze(snapshot, cfg, now = new Date()) {
  const docs = snapshot.docs || [];
  const trained = cfg.trained?.length ? cfg.trained : (snapshot.trained || []);
  return {
    nomenclatura: checkNomenclatura(docs, cfg),
    pastas: checkPastas(docs, cfg),
    semEnvio: checkSemEnvio(docs, trained, cfg, now, snapshot.solic, snapshot.demanda).filter(r => !(cfg.silenciadas || []).some(x => x.cnpj === r.cnpj && silenciadaAgora(x, now))),
    notificacoes: snapshot.notif ? checkNotificacoesOnvio(snapshot.notif, cfg) : checkNotificacoes(snapshot.users || []),
  };
}
