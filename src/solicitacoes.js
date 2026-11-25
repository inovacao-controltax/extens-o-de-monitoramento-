// Última atividade do CLIENTE nas Solicitações de Serviço: o que importa é saber se ele está usando o portal (Josué, 25/11/2026), então conta
// qualquer trâmite do cliente, com ou sem anexo: abrir solicitação geral, lançar rubrica, cadastrar, responder. Só GET. Lê as 10 listas por
// "última atualização" até sair da janela, separa as solicitações das empresas acompanhadas e, em cada uma, os trâmites (a abertura vale como
// trâmite do cliente; nos demais, o lado vem da situação que o trâmite gravou, a mesma regra do Control Onvio). Guarda só código -> data.
import { API, listaDe, AuthError } from './onvio-reader.js';

const PADRAO = [1, 3], CADASTRO = [1, 2, 4], RUBRICAS = [0, 1, 11, 12];
const BR = 'br-payroll-sr/v1/';
export const LISTAS = [
  { chave: 'geral', lista: 'service-requesting/v1/tickets/generic', tramites: 'service-requesting/v1/tickets', cliGrava: PADRAO },
  { chave: 'cadEmpregado', lista: BR + 'employees-registrations', tramites: BR + 'employees-registrations', cliGrava: CADASTRO },
  { chave: 'cadContribuinte', lista: BR + 'taxpayers-registrations', tramites: BR + 'employees-registrations', cliGrava: CADASTRO },
  { chave: 'cadEstagiario', lista: BR + 'interns-registrations', tramites: BR + 'employees-registrations', cliGrava: CADASTRO },
  { chave: 'avisoFerias', lista: BR + 'prior-notice-vacations', tramites: BR + 'tickets', cliGrava: PADRAO },
  { chave: 'calcFerias', lista: BR + 'vacation-calculations', tramites: BR + 'tickets', cliGrava: PADRAO },
  { chave: 'avisoRescisao', lista: BR + 'prior-notice-terminations', tramites: BR + 'tickets', cliGrava: PADRAO },
  { chave: 'calcRescisao', lista: BR + 'termination-calculations', tramites: BR + 'tickets', cliGrava: PADRAO },
  { chave: 'afastamento', lista: BR + 'employee-leave', tramites: BR + 'tickets', cliGrava: PADRAO },
  { chave: 'rubricas', lista: BR + 'payroll-entries', tramites: BR + 'payroll-entries', cliGrava: RUBRICAS },
];
const dia = v => { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; };
const HTTP = e => { const m = /HTTP (\d{3})/.exec(String(e && e.message)); return m ? Number(m[1]) : 0; };

/** Dia (AAAA-MM-DD) do trâmite mais recente feito pelo CLIENTE (com ou sem anexo), ou ''. `topicos` = resposta de {tramites}/{id}/topics. */
export function ultimaAtividadeDoCliente(topicos, cliGrava) {
  const grava = new Set(cliGrava);
  const lista = listaDe(topicos).filter(x => x && x.created && !x.deletedTopic).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  let ult = '';
  lista.forEach((x, i) => {
    const doCliente = i === 0 || grava.has(Number(x.status));
    if (doCliente) { const d = dia(x.created); if (d > ult) ult = d; }
  });
  return ult;
}

/**
 * Última atividade do cliente nas Solicitações, de TODAS as empresas (ou só das de `alvos`, um conjunto de códigos; null = todas).
 * Duas camadas, para ser confiável e barata:
 *  1) as 10 listas, em ordem de última atualização, até sair da janela `desde` (só as listas, ~50 chamadas no total): a data de ABERTURA
 *     da solicitação (`created`) já mostra que o cliente usou o portal naquele dia;
 *  2) só para as empresas que NÃO abriram nada recentemente (ou que precisam de data exata) (antes de `recorte`) mas têm solicitação antiga movimentada depois dela: os trâmites
 *     dessas solicitações (até 2 por empresa), para ver se foi o CLIENTE que respondeu (lado do trâmite pela situação, como o Control Onvio).
 * Devolve { porCodigo: {codigo: 'AAAA-MM-DD'}, lidas, tramites, limitada, semAcesso: [listas] }.
 */
export async function lerEnviosPorSolicitacao(fetcher, alvos, { desde, recorte, precisos, pausa, maxPaginas = 80, maxTramites = 600, listas = LISTAS } = {}) {
  const exatas = new Set([...(precisos || [])].map(String));        // empresas em que a data tem de ser exata (treinadas): também lê as respostas de solicitações recentes
  const codigos = alvos ? new Set([...alvos].map(String)) : null;
  const por = new Map(); let lidas = 0, tramites = 0, limitada = false; const semAcesso = [];
  if (codigos && !codigos.size) return { porCodigo: {}, lidas, tramites, limitada, semAcesso };
  for (const L of listas) {
    for (let pag = 1; pag <= maxPaginas; pag++) {
      let d;
      try { d = await fetcher(`${API}${L.lista}?itemsPerPage=200&pageIndex=${pag}&orderBy=${encodeURIComponent('lastUpdated desc')}&expand=clientExpanded`); }
      catch (e) { if (e instanceof AuthError) throw e; if ([401, 403, 404].includes(HTTP(e))) { if (pag === 1) semAcesso.push(L.chave); break; } throw e; }   // lista sem acesso nesta conta: segue as outras
      const itens = listaDe(d); lidas += itens.length;
      for (const it of itens) {
        const cod = it.clientExpanded && it.clientExpanded.code != null ? String(it.clientExpanded.code) : '';
        if (!cod || (codigos && !codigos.has(cod))) continue;
        const cr = dia(it.created), lu = dia(it.lastUpdated);
        const g = por.get(cod) || por.set(cod, { criada: '', cand: [] }).get(cod);
        if (cr && (!desde || cr >= desde) && cr > g.criada) g.criada = cr;
        if (recorte && lu && lu >= recorte && (!cr || cr < recorte || exatas.has(cod)) && typeof it.id === 'string') g.cand.push({ id: it.id, lu, L });
      }
      const ult = itens.length ? dia(itens[itens.length - 1].lastUpdated) : '';
      if (itens.length < 200 || !ult || (desde && ult < desde)) break;
      if (pausa) await pausa(60);
    }
  }
  const porCodigo = {};
  for (const [cod, g] of por) if (g.criada) porCodigo[cod] = g.criada;
  // 2ª camada: só quem ainda não aparece em uso pela abertura e tem solicitação antiga movimentada há pouco
  const pendentes = [...por.entries()].filter(([cod, g]) => g.cand.length && (exatas.has(cod) || !g.criada || !recorte || g.criada < recorte))
    .sort((x, y) => String(y[1].cand[0].lu).localeCompare(String(x[1].cand[0].lu)));
  for (const [cod, g] of pendentes) {
    for (const c of g.cand.sort((x, y) => String(y.lu).localeCompare(String(x.lu))).slice(0, 2)) {
      if (tramites >= maxTramites) { limitada = true; break; }
      tramites++;
      try {
        const d = await fetcher(`${API}${c.L.tramites}/${c.id}/topics?expand=all&itemsPerPage=1000&orderBy=${encodeURIComponent('created asc')}&pageIndex=0`);
        const u = ultimaAtividadeDoCliente(d, c.L.cliGrava);
        if (u && (!desde || u >= desde) && u > (porCodigo[cod] || '')) porCodigo[cod] = u;
      } catch (e) { if (e instanceof AuthError) throw e; /* um trâmite que não abriu não derruba a leitura */ }
      if (pausa) await pausa(40);
    }
    if (limitada) break;
  }
  return { porCodigo, lidas, tramites, limitada, semAcesso };
}

/** Identifica a lista de empresas acompanhadas (para saber se a leitura das Solicitações ainda vale). */
export const assinaturaTreinadas = trained => (trained || []).map(t => t.cnpj).sort().join(',');
