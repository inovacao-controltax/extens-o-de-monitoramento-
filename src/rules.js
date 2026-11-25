// Regras de verificação (Fase 3). Funções puras: recebem dados brutos + configuração e devolvem listas de pendências.
// Formato dos dados brutos (o mesmo que as coletas reais das Fases 4 e 5 vão produzir):
//   docs:  [{ empresa, cnpj, pasta: 'Fiscal/2026/11', arquivo, data: 'AAAA-MM-DD', origem: 'cliente'|'escritorio' }]
//   users: [{ nome, setor, email, notificaTarefa: boolean, tarefasAtivas: number }]
import { SETORES, compilePattern } from './config.js';

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
    g.arquivos++; grupos.set(k, g);
  }
  return [...grupos.values()].sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
}

/**
 * Clientes treinados sem envio. Referência = último envio do cliente; se nunca enviou, a data do treinamento
 * (carência: quem acabou de ser treinado ainda não está atrasado). Sem nenhuma das duas datas, entra como "nunca enviou".
 * dias === null significa "nunca enviou nada".
 */
export function checkSemEnvio(docs, trained, cfg, now = new Date()) {
  const ultimo = new Map();
  for (const d of docs) {
    if (d.origem !== 'cliente') continue;
    const t = utcDay(d.data); if (t === null) continue;
    if (!ultimo.has(d.cnpj) || t > ultimo.get(d.cnpj)) ultimo.set(d.cnpj, t);
  }
  const out = [];
  for (const t of trained) {
    const last = ultimo.get(t.cnpj);
    const dias = last === undefined ? null : Math.floor((today(now) - last) / DAY);
    const ref = dias !== null ? dias : (t.treinadoEm ? daysSince(t.treinadoEm, now) : null);
    if (ref === null || ref > cfg.diasSemEnvio) out.push({ empresa: t.empresa, cnpj: t.cnpj, treinadoEm: t.treinadoEm, demanda: t.demanda || [], dias });
  }
  return out.sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity));
}

/** Funcionários com o aviso de tarefa nova desligado e que têm tarefas ativas. */
export function checkNotificacoes(users) {
  return users.filter(u => u.notificaTarefa === false && u.tarefasAtivas !== 0)
    .map(u => ({ nome: u.nome, setor: u.setor, email: u.email, tarefasAtivas: u.tarefasAtivas }))
    .sort((a, b) => (b.tarefasAtivas ?? 0) - (a.tarefasAtivas ?? 0));
}

/** Se a configuração não tem clientes treinados, usa os do snapshot (dados de exemplo). */
export function analyze(snapshot, cfg, now = new Date()) {
  const docs = snapshot.docs || [];
  const trained = cfg.trained?.length ? cfg.trained : (snapshot.trained || []);
  return {
    nomenclatura: checkNomenclatura(docs, cfg),
    pastas: checkPastas(docs, cfg),
    semEnvio: checkSemEnvio(docs, trained, cfg, now),
    notificacoes: checkNotificacoes(snapshot.users || []),
  };
}
