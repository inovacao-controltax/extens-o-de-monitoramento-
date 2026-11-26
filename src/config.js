// Configurações do hub (Fase 2). Funções puras + persistência em chrome.storage.local.
// Fora da extensão (prévia no navegador comum) cai para localStorage, e sem ele, para memória.

export const DEFAULT_CONFIG = {
  // Padrão oficial da ControlTax (Josué, 25/11/2026): a competência MM-AAAA vem ANTES do nome do arquivo; o que foge disso está errado.
  // Ex.: "10-2026 Folha de pagamento.pdf".
  filePattern: '^(0[1-9]|1[0-2])-20\\d{2} \\S.*$',
  // Os 8 projetos (departamentos) que o Onvio cria em toda empresa, mais Contábil e Comunicados como variações comuns.
  allowedFolders: ['Administrativo', 'Certidão Negativa de Débito', 'Contabilidade', 'Contábil', 'Financeiro', 'Fiscal', 'Patrimônio', 'Pessoal', 'Registro de Empresas', 'Comunicados'],
  diasSemEnvio: 90,   // Josué, 26/11/2026: o alerta padrão é de 90 dias (era 30)
  autoLer: true,      // ler o Onvio sozinho, em segundo plano, quando os dados têm mais de horasAuto
  horasAuto: 6,
  gesttaCampo: '',    // caminho do campo "recebe notificação de tarefa nova" no cadastro do funcionário (vazio = detectar)
  notifPadraoDesligado: true,   // funcionário SEM configuração salva (404) conta como desativado? Confirmado: no Onvio ele aparece com "nova Solicitação" desmarcada
  notifCampoEmail: '', notifCampoSistema: '',   // caminhos dos campos "nova Solicitação de Serviço" (vazio = detectar)
  hubCodigo: '',      // código de pareamento do Control Hub (o mesmo do Control Onvio): liga a extensão ao Hub para puxar os clientes treinados
  hubAuto: true,      // com o código e o Hub aberto numa aba, atualizar a lista de treinados sozinho a cada horasAuto
  silenciadas: [],    // empresas que não devem aparecer em "sem envio": [{ cnpj, ate: 'AAAA-MM-DD'|'' (sem data), motivo, em }]
  msgAviso: '',        // texto do aviso ao cliente sem uso do portal (vazio = o padrão de src/aviso.js); variáveis {empresa} {dias} {ultima} {assinatura}
  msgAssinatura: 'Equipe ControlTax',
  zimbraUrl: 'https://mail.controltax.com.br/',   // onde abre o rascunho (a extensão nunca envia)
  avisados: {},        // { cnpj: 'AAAA-MM-DD' }: dia em que o rascunho do aviso foi aberto
  trained: [], // [{ empresa, cnpj (14 dígitos), treinadoEm 'AAAA-MM-DD'|'', demanda: ['Pessoal', ...] }]
};

export const SETORES = ['Pessoal', 'Fiscal', 'Contábil'];   // a aba Financeiro saiu (Josué, 26/11/2026); a pasta Financeiro do Onvio continua permitida e lida
// Projetos onde a leitura desce até os arquivos (os outros entram só pelo nome, para a leitura ser mais rápida).
export const DEPARTAMENTOS_LIDOS = ['Pessoal', 'Fiscal', 'Contabilidade', 'Contábil', 'Financeiro'];
const PADRAO_ANTIGO = '^\\d{4}-\\d{2} - [A-Za-z0-9ÇÃÕÁÉÍÓÚ ]+ - .+\\.(pdf|xlsx?|xml|ofx|csv|zip)$';   // exemplo das primeiras versões
const LISTA_ANTIGA = ['Contábil', 'Fiscal', 'Pessoal', 'Financeiro', 'Comunicados'];   // padrão da 1ª versão: dava alarme falso em toda empresa
const KEY = 'monitor-config';

// ---------- CNPJ ----------
// Aceita o CNPJ numérico e o alfanumérico (12 primeiras posições com letras A-Z, 2 dígitos verificadores).
export const normalizeCnpj = s => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
export const onlyDigits = normalizeCnpj; // nome antigo, mantido por compatibilidade
export function isValidCnpj(v) {
  const d = normalizeCnpj(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(.)\1+$/.test(d)) return false;
  const val = c => c.charCodeAt(0) - 48; // 0-9 -> 0-9, A -> 17 ...
  const calc = len => {
    let sum = 0, pos = len - 7;
    for (let i = 0; i < len; i++) { sum += val(d[i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
export function formatCnpj(v) {
  const d = normalizeCnpj(v);
  return d.length === 14 ? d.replace(/^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/, '$1.$2.$3/$4-$5') : String(v ?? '');
}

// ---------- Validação ----------
export function compilePattern(src) {
  try { return { re: new RegExp(src, 'i') }; } catch (e) { return { error: String(e.message).replace(/^Invalid regular expression: (\/.*\/[a-z]*: )?/, '') }; }
}
export function validateConfig(cfg) {
  const errors = {};
  if (!cfg.filePattern?.trim()) errors.filePattern = 'Informe a expressão do padrão de nome.';
  else { const c = compilePattern(cfg.filePattern); if (c.error) errors.filePattern = `Expressão inválida: ${c.error}. Corrija e tente de novo.`; }
  if (!cfg.allowedFolders?.length) errors.allowedFolders = 'Informe pelo menos uma pasta permitida.';
  const d = cfg.diasSemEnvio;
  if (!Number.isInteger(d) || d < 1 || d > 365) errors.diasSemEnvio = 'Use um número inteiro de 1 a 365 dias.';
  return errors;
}
export function testFileName(pattern, nome) {
  const c = compilePattern(pattern);
  if (c.error || !nome.trim()) return null;
  return c.re.test(nome.trim());
}

// ---------- Lista de clientes treinados (colar da planilha) ----------
// Colunas: empresa ; cnpj ; treinado em (dd/mm/aaaa) ; demanda (Pessoal, Fiscal...). Aceita ; ou TAB.
function parseDate(s) {
  s = String(s ?? '').trim(); if (!s) return '';
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? s : null;
}
export function parseTrained(text) {
  const rows = [], errors = [];
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const c = raw.split(/\t|;/).map(x => x.trim());
    if (i === 0 && /^empresa$/i.test(c[0])) return; // cabeçalho
    const n = i + 1;
    if (!c[0]) return errors.push({ linha: n, msg: 'Falta o nome da empresa.' });
    const d = normalizeCnpj(c[1]);
    if (d.length !== 14) return errors.push({ linha: n, msg: `CNPJ com ${d.length} caracteres. Confira o número e tente de novo.` });
    if (!isValidCnpj(d)) return errors.push({ linha: n, msg: 'CNPJ inválido (dígitos verificadores não conferem).' });
    const data = parseDate(c[2]);
    if (data === null) return errors.push({ linha: n, msg: 'Data fora do formato. Use dd/mm/aaaa.' });
    const demanda = (c[3] || '').split(/[,/]/).map(s => s.trim()).filter(Boolean)
      .map(s => SETORES.find(x => x.toLowerCase() === s.toLowerCase()) || s);
    const fora = demanda.find(s => !SETORES.includes(s));
    if (fora) return errors.push({ linha: n, msg: `Setor "${fora}" desconhecido. Use: ${SETORES.join(', ')}.` });
    rows.push({ empresa: c[0], cnpj: d, treinadoEm: data, demanda });
  });
  return { rows, errors };
}
export function mergeTrained(current, incoming) {
  const map = new Map(current.map(t => [t.cnpj, t]));
  incoming.forEach(t => map.set(t.cnpj, t));
  return [...map.values()].sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
}

// ---------- Persistência ----------
let memory = null;
const ext = () => (typeof chrome !== 'undefined' && chrome.storage?.local) || null;
export async function loadConfig() {
  let saved = null;
  try {
    if (ext()) saved = (await ext().get(KEY))[KEY];
    else if (typeof localStorage !== 'undefined') saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    else saved = memory;
  } catch (e) { console.error('loadConfig', e); }
  if (saved && saved.filePattern === PADRAO_ANTIGO) saved.filePattern = DEFAULT_CONFIG.filePattern;   // troca o exemplo antigo pelo padrão oficial
  if (saved && Array.isArray(saved.allowedFolders) && JSON.stringify(saved.allowedFolders) === JSON.stringify(LISTA_ANTIGA)) saved.allowedFolders = structuredClone(DEFAULT_CONFIG.allowedFolders);
  if (saved && saved.diasSemEnvio === 30) saved.diasSemEnvio = DEFAULT_CONFIG.diasSemEnvio;   // 30 era o padrão antigo; quem quiser outro valor escolhe
  return { ...structuredClone(DEFAULT_CONFIG), ...(saved || {}) };
}
export async function saveConfig(cfg) {
  const errors = validateConfig(cfg);
  if (Object.keys(errors).length) return { ok: false, errors };
  try {
    if (ext()) await ext().set({ [KEY]: cfg });
    else if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cfg));
    else memory = structuredClone(cfg);
    return { ok: true };
  } catch (e) { return { ok: false, errors: { _geral: `Não foi possível salvar: ${e.message}` } }; }
}
