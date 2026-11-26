// Histórico e alertas (fase 6). Funções puras: comparam as pendências de agora com as da última vez e guardam só chaves e contagens
// (nunca o conteúdo dos arquivos). "Nova" = pendência que não estava na leitura anterior do mesmo monitor.
export const CHAVE_HIST = 'monitor-historico';
const DIA = 864e5;
const MAX_NOVAS = 200, MAX_SERIE = 336;     // 14 dias de uma leitura por hora

/** Identifica uma pendência dentro do monitor (a mesma empresa/arquivo/funcionário continua sendo a mesma). */
export const chaveDe = (k, r) => `${k}|${r.cnpj || r.nome || r.empresa || ''}|${r.arquivo || r.pasta || r.motivo || ''}`;

/** Texto curto de uma pendência para a lista de novidades. */
export const textoDe = (k, r) => {
  const quem = r.empresa || r.nome || r.cnpj || '';
  if (k === 'nomenclatura') return `${quem}: ${r.arquivo}`;
  if (k === 'pastas') return `${quem}: pasta "${r.pasta}"`;
  if (k === 'semEnvio') return `${quem}: ${r.dias === null || r.dias === undefined ? 'nenhum envio registrado' : r.dias + ' dias sem envio'}`;
  if (k === 'notificacoes') return `${quem}: ${r.motivo || 'aviso de nova solicitação desligado'}`;
  return quem;
};

export const novoHistorico = () => ({ v: 1, atual: {}, bases: [], novas: [], serie: [], fontes: '' });

/**
 * h: histórico anterior (ou null). R: { monitor: [linhas] }. prontos: monitores cuja leitura está completa (os outros ficam como estavam,
 * para uma leitura em andamento não virar "tudo novo"). A primeira vez que um monitor fica pronto só marca o ponto de partida: nada é novo.
 * Devolve o histórico novo; `h.novas[*].visto` diz o que a pessoa ainda não viu.
 */
export function atualizarHistorico(h, R, now, { prontos, fontes = '' } = {}) {
  const novo = h && h.v === 1 ? structuredClone(h) : novoHistorico();
  const agora = (now instanceof Date ? now : new Date(now)).toISOString();
  const contagens = {};
  for (const k of Object.keys(R)) {
    if (!prontos || !prontos.has(k)) continue;
    const linhas = R[k] || [], chaves = linhas.map(r => chaveDe(k, r));
    contagens[k] = linhas.length;
    if (!novo.bases.includes(k)) { novo.bases.push(k); novo.atual[k] = chaves; continue; }
    const antes = new Set(novo.atual[k] || []), ja = new Set(novo.novas.map(n => n.key));
    linhas.forEach((r, i) => { if (!antes.has(chaves[i]) && !ja.has(chaves[i])) novo.novas.push({ k, key: chaves[i], texto: textoDe(k, r), em: agora, visto: false }); });
    novo.atual[k] = chaves;
  }
  // o que já foi resolvido sai da lista de novidades; o resto fica (visto ou não) por 14 dias
  const limite = Date.parse(agora) - 14 * DIA;
  novo.novas = novo.novas.filter(n => !(prontos && prontos.has(n.k)) || (novo.atual[n.k] || []).includes(n.key)).filter(n => Date.parse(n.em) >= limite).slice(-MAX_NOVAS);
  if (Object.keys(contagens).length) {
    const ult = novo.serie[novo.serie.length - 1];
    const igual = ult && JSON.stringify(ult.n) === JSON.stringify({ ...ult.n, ...contagens });
    if (!ult || !igual || Date.parse(agora) - Date.parse(ult.em) >= 3600 * 1000) novo.serie.push({ em: agora, n: { ...(ult ? ult.n : {}), ...contagens } });
    novo.serie = novo.serie.slice(-MAX_SERIE);
  }
  novo.fontes = fontes;
  return novo;
}

export const naoVistas = h => ((h && h.novas) || []).filter(n => !n.visto);
export const marcarVistas = h => (h ? { ...h, novas: h.novas.map(n => ({ ...n, visto: true })) } : h);

/** Evolução por monitor: agora contra o ponto mais próximo de `dias` atrás. [{ k, agora, antes, delta }] */
export function evolucao(h, dias = 7, now = new Date()) {
  const s = (h && h.serie) || []; if (!s.length) return [];
  const fim = s[s.length - 1], alvo = now.getTime() - dias * DIA;
  const antes = s.reduce((m, x) => (Math.abs(Date.parse(x.em) - alvo) < Math.abs(Date.parse(m.em) - alvo) ? x : m), s[0]);
  return Object.keys(fim.n).map(k => ({ k, agora: fim.n[k], antes: antes.n[k] ?? null, delta: antes.n[k] == null ? null : fim.n[k] - antes.n[k], desde: antes.em }));
}

/**
 * Resumo do dia: o que apareceu nas últimas 24 h (por monitor, com o texto das novidades) e quanto cada monitor mudou desde ontem.
 * Só lê o histórico que já existe; sem permissão nova e sem notificação do Chrome. { novas: [{ k, n, textos }], variacao: [{ k, agora, delta }], total }
 */
export function resumoDoDia(h, now = new Date()) {
  const corte = now.getTime() - DIA, por = new Map();
  for (const n of (h && h.novas) || []) {
    if (Date.parse(n.em) < corte) continue;
    const x = por.get(n.k) || por.set(n.k, { k: n.k, n: 0, textos: [] }).get(n.k);
    x.n++; if (x.textos.length < 3) x.textos.push(n.texto);
  }
  const novas = [...por.values()].sort((a, b) => b.n - a.n);
  const variacao = evolucao(h, 1, now).filter(e => e.delta !== null && e.delta !== 0).map(e => ({ k: e.k, agora: e.agora, delta: e.delta }));
  return { novas, variacao, total: novas.reduce((s, x) => s + x.n, 0) };
}

/** CSV (separador ;, com BOM para o Excel abrir em UTF-8). linhas: arrays de texto. */
export function paraCsv(linhas) {
  const cel = v => { const t = String(v ?? '').replace(/\r?\n/g, ' '); return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n') + '\r\n';
}
