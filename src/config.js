// Configurações do hub (Fase 2). Funções puras + persistência em chrome.storage.local.
// Fora da extensão (prévia no navegador comum) cai para localStorage, e sem ele, para memória.

export const DEFAULT_CONFIG = {
  // Padrão de EXEMPLO "AAAA-MM - TIPO - Descrição.ext". Trocar pelo padrão oficial da ControlTax.
  filePattern: '^\\d{4}-\\d{2} - [A-Za-z0-9ÇÃÕÁÉÍÓÚ ]+ - .+\\.(pdf|xlsx?|xml|ofx|csv|zip)$',
  allowedFolders: ['Contábil', 'Fiscal', 'Pessoal', 'Financeiro', 'Comunicados'],
  diasSemEnvio: 30,
  trained: [], // [{ empresa, cnpj (14 dígitos), treinadoEm 'AAAA-MM-DD'|'', demanda: ['Pessoal', ...] }]
};

export const SETORES = ['Pessoal', 'Fiscal', 'Contábil', 'Financeiro'];
const KEY = 'monitor-config';

// ---------- CNPJ ----------
export const onlyDigits = s => String(s ?? '').replace(/\D/g, '');
export function isValidCnpj(v) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = len => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { sum += d[len - i] * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
export function formatCnpj(v) {
  const d = onlyDigits(v);
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : String(v ?? '');
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
    const d = onlyDigits(c[1]);
    if (d.length !== 14) return errors.push({ linha: n, msg: `CNPJ com ${d.length} dígitos. Confira o número e tente de novo.` });
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
