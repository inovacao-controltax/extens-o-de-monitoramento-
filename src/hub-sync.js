// Clientes treinados a partir dos dados do Control Hub (módulo Portal do Cliente).
// Mesma regra do Hub (portal.js, statusClienteComputado): o treinamento é calculado por empresa e setor
// a partir dos CONTATOS do cliente. Em cada setor: concluído = todos os contatos concluídos; em andamento =
// algum concluído ou em andamento. Entram as empresas com pelo menos um setor concluído ou em andamento
// (as "não 100% treinadas", marcadas como parcial, só vêm com { soCompletas: false }; de fábrica só as 100% treinadas, com contato).
import { normalizeCnpj } from './config.js';

const SETOR_HUB = { pessoal: 'Pessoal', contabil: 'Contábil', fiscal: 'Fiscal', financeiro: 'Financeiro' };

/** empresas: [{ id, nome, cnpj }]; contatos: [{ empresaId, setores: ['pessoal',...], statusTreinamento, concluidoEm }] */
export function trainedFromHub({ empresas = [], contatos = [] } = {}, { soCompletas = true } = {}) {
  const porEmpresa = new Map();
  for (const c of contatos) {
    for (const sk of c.setores || []) {
      const e = porEmpresa.get(c.empresaId) || new Map();
      (e.get(sk) || e.set(sk, []).get(sk)).push(c);
      porEmpresa.set(c.empresaId, e);
    }
  }
  const out = [];
  for (const emp of empresas) {
    const setores = porEmpresa.get(emp.id); if (!setores) continue;
    const cnpj = normalizeCnpj(emp.cnpj); if (cnpj.length !== 14) continue;
    const treinados = []; let parcial = false; let ultima = '';
    for (const [sk, lista] of setores) {
      const feitos = lista.filter(c => c.statusTreinamento === 'concluido');
      const andamento = feitos.length > 0 || lista.some(c => c.statusTreinamento === 'andamento');
      if (!andamento) { parcial = true; continue; } // setor com contato, sem treinamento iniciado
      treinados.push(SETOR_HUB[sk] || sk);
      if (feitos.length !== lista.length) parcial = true;
      for (const c of feitos) { const d = String(c.concluidoEm || '').slice(0, 10); if (d > ultima) ultima = d; }
    }
    if (!treinados.length) continue;
    if (soCompletas && parcial) continue;   // Josué, 25/11/2026: só entra empresa com contato e 100% treinada
    out.push({ empresa: emp.nome, cnpj, treinadoEm: ultima, demanda: treinados, parcial });
  }
  return out.sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
}
