// Aviso ao cliente que está sem usar o portal (fase 7). A extensão NUNCA envia: prepara o texto e abre o rascunho no Zimbra; a pessoa confere e envia.
// O texto padrão não pede documento assinado, termo nem atestado (regra do escritório) e fala do portal, não de cobrança.
export const ASSUNTO_PADRAO = 'Portal do Cliente · {empresa}';
export const MENSAGEM_PADRAO = `Olá,

Percebemos que a {empresa} não usa o Portal do Cliente há {dias} dias{ultima}.

É por ele que você envia os documentos e abre solicitações para o escritório, e é onde acompanhamos tudo com mais agilidade e segurança. Se estiver com alguma dificuldade para acessar ou precisar de ajuda para enviar, é só responder este e-mail que ajudamos.

Atenciosamente,
{assinatura}`;
export const ZIMBRA_PADRAO = 'https://mail.controltax.com.br/';

const dmy = iso => /^\d{4}-\d{2}-\d{2}/.test(String(iso)) ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';

/** Troca as variáveis {empresa}, {dias}, {ultima}, {assinatura}. linha: { empresa, dias (null = nunca), data? 'AAAA-MM-DD' }. */
export function montarAviso(cfg, linha) {
  const nunca = linha.dias === null || linha.dias === undefined;
  const dias = nunca ? 'muito tempo' : String(linha.dias);
  const ultima = !nunca && linha.data ? ` (a última atividade foi em ${dmy(linha.data)})` : '';
  const vars = { empresa: linha.empresa || '', dias, ultima, assinatura: (cfg && cfg.msgAssinatura) || 'Equipe ControlTax' };
  const troca = t => String(t).replace(/\{(empresa|dias|ultima|assinatura)\}/g, (_, k) => vars[k]).replace(/muito tempo dias/g, 'muito tempo');
  return { assunto: troca(ASSUNTO_PADRAO), corpo: troca((cfg && cfg.msgAviso) || MENSAGEM_PADRAO) };
}

/**
 * Endereço do rascunho no Zimbra. O Zimbra decodifica o endereço inteiro antes de separar os campos: "&", "+" e "%" no texto viram
 * os parecidos de largura total para não quebrarem o assunto ou o corpo (mesmo cuidado do Control Hub).
 */
export function linkZimbra(base, { assunto, corpo, para = '', cc = '' }) {
  const fix = t => String(t).replace(/&/g, '＆').replace(/\+/g, '＋').replace(/%/g, '％');
  const raiz = (/^https:\/\/[^\s]+$/.test(String(base || '').trim()) ? String(base).trim() : ZIMBRA_PADRAO).replace(/[?#].*$/, '').replace(/\/?$/, '/');   // só https; qualquer outra coisa volta ao padrão
  const lista = v => (Array.isArray(v) ? v.join(',') : String(v || ''));
  return `${raiz}?view=compose&to=${encodeURIComponent(lista(para))}${lista(cc) ? `&cc=${encodeURIComponent(lista(cc))}` : ''}&subject=${encodeURIComponent(fix(assunto))}&body=${encodeURIComponent(fix(corpo))}`;
}

const EMAIL = /[^\s<>;,"']+@[^\s<>;,"']+\.[^\s<>;,"']+/g;
/**
 * Quem recebe o aviso, a partir dos contatos da empresa no Hub (mesma regra do e-mail inicial do Hub): uma pessoa no Para (a que tem acesso a
 * mais setores; no empate, a treinada, depois a primeira) e as outras em Cópia. A mesma pessoa uma vez só; um campo com mais de um e-mail vira
 * uma pessoa por e-mail. contatos: [{ nome, email, setores: [...], treinado }]. Só em memória: nada é guardado.
 */
export function destinatarios(contatos, { maxCc = 12 } = {}) {
  const por = new Map();
  for (const c of contatos || []) {
    for (const bruto of String(c && c.email || '').match(EMAIL) || []) {
      const chave = bruto.toLowerCase();
      const x = por.get(chave) || por.set(chave, { email: bruto, nome: '', setores: new Set(), treinado: false }).get(chave);
      for (const st of c.setores || []) x.setores.add(st);
      if (c.treinado) x.treinado = true;
      if (!x.nome && c.nome) x.nome = String(c.nome);
    }
  }
  const ordenada = [...por.values()].map((x, i) => ({ ...x, i, n: x.setores.size })).sort((a, b) => b.n - a.n || Number(b.treinado) - Number(a.treinado) || a.i - b.i);
  if (!ordenada.length) return { para: '', cc: [], total: 0, cortados: 0, pessoas: [] };
  const [p, ...resto] = ordenada;
  return { para: p.email, cc: resto.slice(0, maxCc).map(x => x.email), total: ordenada.length, cortados: Math.max(0, resto.length - maxCc), pessoas: ordenada.map(x => ({ nome: x.nome, email: x.email, setores: [...x.setores] })) };
}
