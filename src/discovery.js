// Modo descoberta (Fase 4a): a partir de nomes de arquivos e caminhos reais, mostra os formatos mais comuns
// para a equipe escolher o padrão oficial. Funções puras, sem rede.
import { SETORES } from './config.js';

const TOKEN = /(\d+)|(\p{L}+(?: \p{L}+)*)|([^\d\p{L}])/gu;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Separa "nome.ext": a extensão só vale se tiver até 5 letras/números. */
export function splitExt(nome) {
  const m = /^(.*)\.([A-Za-z0-9]{1,5})$/.exec(String(nome ?? '').trim());
  return m ? { base: m[1], ext: m[2].toLowerCase() } : { base: String(nome ?? '').trim(), ext: '' };
}

/** Formato de um nome: números viram 9{n}, palavras viram X, separadores ficam. "2026-11 - NFE - x" -> "9{4}-9{2} - X - X". */
export function shapeOf(base) {
  return [...String(base).matchAll(TOKEN)].map(m => m[1] ? `9{${m[1].length}}` : m[2] ? 'X' : m[3]).join('');
}

/** Expressão (regex) que aceita todos os nomes desse formato. */
export function regexFromShape(shape, exts = []) {
  const body = shape.split(/(9\{\d+\}|X)/).map(p => /^9\{\d+\}$/.test(p) ? `\\d{${/\{(\d+)\}/.exec(p)[1]}}` : p === 'X' ? '.+' : esc(p)).join('');
  const ext = exts.length ? `\\.(${exts.map(esc).join('|')})` : '';
  return `^${body}${ext}$`;
}

/** names: nomes de arquivo (um por item). Devolve os formatos, do mais comum ao menos comum. */
export function discoverNames(names) {
  const grupos = new Map();
  let total = 0;
  for (const n of names) {
    const nome = String(n ?? '').trim(); if (!nome) continue;
    total++;
    const { base, ext } = splitExt(nome);
    const shape = shapeOf(base);
    const g = grupos.get(shape) || { shape, count: 0, exts: new Set(), examples: [] };
    g.count++; if (ext) g.exts.add(ext);
    if (g.examples.length < 3) g.examples.push(nome);
    grupos.set(shape, g);
  }
  return {
    total,
    formatos: [...grupos.values()].sort((a, b) => b.count - a.count).map(g => {
      const exts = [...g.exts].sort();
      return { shape: g.shape, count: g.count, pct: total ? Math.round((g.count / total) * 100) : 0, exts, examples: g.examples, regex: regexFromShape(g.shape, exts) };
    }),
  };
}

/** paths: caminhos como "Fiscal/2026/11/arquivo.pdf" (ou com \). Conta as pastas de primeiro nível. */
export function discoverFolders(paths) {
  const cont = new Map(); let total = 0;
  for (const p of paths) {
    const partes = String(p ?? '').split(/[\\/]/).map(s => s.trim()).filter(Boolean);
    if (partes.length < 2) continue; // sem pasta
    total++;
    const k = partes[0].normalize('NFC');
    cont.set(k, (cont.get(k) || 0) + 1);
  }
  return {
    total,
    pastas: [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([nome, count]) => ({ nome, count, pct: Math.round((count / total) * 100), setor: SETORES.includes(nome) })),
  };
}
