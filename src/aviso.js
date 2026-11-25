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
export function linkZimbra(base, { assunto, corpo, para = '' }) {
  const fix = t => String(t).replace(/&/g, '＆').replace(/\+/g, '＋').replace(/%/g, '％');
  const raiz = (/^https:\/\/[^\s]+$/.test(String(base || '').trim()) ? String(base).trim() : ZIMBRA_PADRAO).replace(/[?#].*$/, '').replace(/\/?$/, '/');   // só https; qualquer outra coisa volta ao padrão
  return `${raiz}?view=compose&to=${encodeURIComponent(para)}&subject=${encodeURIComponent(fix(assunto))}&body=${encodeURIComponent(fix(corpo))}`;
}
