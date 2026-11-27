// Correção de nomes de arquivo fora do padrão (parte 1: só PROPOR; nada é escrito no Onvio aqui).
// Padrão oficial: "MM-AAAA nome" (a competência antes do nome). A proposta só sai quando a competência é CERTA:
//   1) está no próprio nome do arquivo (AAAA-MM, MM.AAAA, "Folha 10-2026", "outubro 2026"...), ou
//   2) está no caminho da pasta (Fiscal/2026/11, Pessoal/11-2026).
// Se houver duas competências diferentes, ou nenhuma, o arquivo NÃO é corrigido sozinho: vai para "precisa da sua escolha".
const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const sa = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const mm = n => String(n).padStart(2, '0');
const valida = (m, a) => m >= 1 && m <= 12 && a >= 2000 && a <= 2099;
const SEP = '[-_./ ]';

/** Todas as competências achadas num texto: [{ m, a, ini, fim }] (sem confundir com datas completas dd-mm-aaaa). */
export function competenciasNoTexto(texto) {
  const t = String(texto ?? ''), out = [];
  const add = (m, a, ini, fim) => { if (valida(m, a)) out.push({ m, a, ini, fim }); };
  let r;
  const aaaaMm = new RegExp(`(?<![\\d])(20\\d{2})${SEP}(0?[1-9]|1[0-2])(?![\\d])(?!${SEP}\\d)`, 'g');      // 2026-10 (não 2026-10-15)
  while ((r = aaaaMm.exec(t))) add(+r[2], +r[1], r.index, r.index + r[0].length);
  const mmAaaa = new RegExp(`(?<![\\d])(?<!\\d${SEP})(0?[1-9]|1[0-2])${SEP}(20\\d{2})(?![\\d])`, 'g');           // 10-2026 (não 15-10-2026)
  while ((r = mmAaaa.exec(t))) add(+r[1], +r[2], r.index, r.index + r[0].length);
  // MMAAAA colado, entre separadores (ex.: recibos da DCTF Web "Recibo_<cnpj>_082026_40_..."): só 6 dígitos exatos, nunca dentro de um número maior
  const colado = /(?<=^|[_\s-])(0[1-9]|1[0-2])(20\d{2})(?=$|[_\s.-])/g;
  while ((r = colado.exec(t))) add(+r[1], +r[2], r.index, r.index + r[0].length);
  const sem = sa(t), porExtenso = new RegExp(`(?<![a-z])(${Object.keys(MESES).join('|')})(?:${SEP}+(?:de${SEP}+)?)(20\\d{2})(?![\\d])`, 'g');
  while ((r = porExtenso.exec(sem))) add(MESES[r[1]], +r[2], r.index, r.index + r[0].length);       // sem acento mantém o tamanho do texto
  return out;
}

/** Competência do caminho da pasta ("Fiscal/2026/11", "Pessoal/11-2026"): { m, a } ou null (null também se for ambíguo). */
export function competenciaDoCaminho(pasta) {
  const partes = String(pasta ?? '').split('/').map(s => s.trim()).filter(Boolean);
  const achadas = [];
  partes.forEach((p, i) => {
    const c = competenciasNoTexto(p); if (c.length) achadas.push(...c.map(({ m, a }) => ({ m, a })));
    const ano = /^(20\d{2})$/.exec(p), mes = /^(0?[1-9]|1[0-2])$/.exec(partes[i + 1] || '');
    if (ano && mes) achadas.push({ m: +mes[1], a: +ano[1] });
  });
  const unicas = [...new Map(achadas.map(c => [`${c.a}-${c.m}`, c])).values()];
  return unicas.length === 1 ? unicas[0] : null;
}

/**
 * Proposta de novo nome para UM arquivo. { ok:true, novo, de: 'nome'|'pasta' } ou { ok:false, motivo }:
 * 'ja-no-padrao' | 'sem-competencia' | 'competencia-ambigua' | 'sem-nome'.
 */
export function proporNome(arquivo, pasta, padrao) {
  const nome = String(arquivo ?? '').trim();
  if (padrao && padrao.test(nome)) return { ok: false, motivo: 'ja-no-padrao' };
  const dot = nome.lastIndexOf('.'), ext = dot > 0 && nome.length - dot <= 6 ? nome.slice(dot) : '', base = ext ? nome.slice(0, dot) : nome;
  const noNome = competenciasNoTexto(base), unicas = [...new Map(noNome.map(c => [`${c.a}-${c.m}`, c])).values()];
  let comp = null, de = '', resto = base;
  if (unicas.length > 1) return { ok: false, motivo: 'competencia-ambigua' };
  if (unicas.length === 1) {
    comp = unicas[0]; de = 'nome';
    // tira só o trecho da competência (todas as ocorrências iguais), com os separadores que sobram nas pontas
    resto = noNome.sort((x, y) => y.ini - x.ini).reduce((s, c) => s.slice(0, c.ini) + ' ' + s.slice(c.fim), base);
  } else {
    comp = competenciaDoCaminho(pasta); de = 'pasta';
    if (!comp) return { ok: false, motivo: 'sem-competencia' };
  }
  resto = resto.replace(/[_-]\s+[_-]/g, '_').replace(/\s+/g, ' ').replace(/^[\s\-_.–—:,]+|[\s\-_.–—:,]+$/g, '').trim();
  if (!resto) return { ok: false, motivo: 'sem-nome' };
  const novo = `${mm(comp.m)}-${comp.a} ${resto}${ext}`;
  if (padrao && !padrao.test(novo)) return { ok: false, motivo: 'sem-competencia' };       // a proposta tem de passar no padrão, senão não vale
  if (novo === nome) return { ok: false, motivo: 'ja-no-padrao' };
  return { ok: true, novo, de };
}

export const MOTIVOS_SEM_PROPOSTA = {
  'sem-competencia': 'Sem competência no nome nem na pasta',
  'competencia-ambigua': 'Mais de uma competência no nome',
  'sem-nome': 'Só a competência, sem nome',
  'duplicado': 'Já existe um arquivo com o nome novo na pasta',
  'sem-id': 'Sem identificador do arquivo (leia de novo)',
};

/**
 * Plano de correção das linhas de "Nomenclatura": [{ ...linha, novo, de }] prontas e [{ ...linha, motivo }] que precisam de escolha.
 * `existentes` (todos os arquivos lidos) serve para nunca propor um nome que já existe na mesma pasta da mesma empresa.
 */
export function planoDeCorrecao(linhas, padrao, existentes = []) {
  const usados = new Set(existentes.map(d => `${d.cnpj}|${d.pasta}|${String(d.arquivo).toLowerCase()}`));
  const prontas = [], pendentes = [];
  for (const l of linhas) {
    const p = proporNome(l.arquivo, l.pasta, padrao);
    if (!p.ok) { pendentes.push({ ...l, motivo: p.motivo }); continue; }
    const k = `${l.cnpj}|${l.pasta}|${p.novo.toLowerCase()}`;
    if (usados.has(k)) { pendentes.push({ ...l, motivo: 'duplicado' }); continue; }
    if (!l.docId) { pendentes.push({ ...l, motivo: 'sem-id', novo: p.novo }); continue; }
    usados.add(k); prontas.push({ ...l, novo: p.novo, de: p.de });
  }
  return { prontas, pendentes };
}
