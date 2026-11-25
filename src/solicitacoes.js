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
 * alvos: códigos de empresa (clientExpanded.code) acompanhadas. Devolve { porCodigo: {codigo: 'AAAA-MM-DD'}, lidas, trâmites, limitada }.
 * `desde` = AAAA-MM-DD: solicitações paradas antes disso não entram (nada novo dentro da janela).
 */
export async function lerEnviosPorSolicitacao(fetcher, alvos, { desde, pausa, maxPaginas = 8, maxTramites = 200, listas = LISTAS } = {}) {
  const codigos = new Set([...alvos].map(String));
  const porCodigo = {}; let lidas = 0, tramites = 0, limitada = false;
  if (!codigos.size) return { porCodigo, lidas, tramites, limitada };
  for (const L of listas) {
    const achadas = [];
    for (let pag = 1; pag <= maxPaginas; pag++) {
      let d;
      try { d = await fetcher(`${API}${L.lista}?itemsPerPage=200&pageIndex=${pag}&orderBy=${encodeURIComponent('lastUpdated desc')}&expand=clientExpanded`); }
      catch (e) { if (e instanceof AuthError) throw e; if ([401, 403, 404].includes(HTTP(e))) break; throw e; }   // lista sem acesso nesta conta: segue as outras
      const itens = listaDe(d); lidas += itens.length;
      for (const it of itens) {
        if (dia(it.lastUpdated) && desde && dia(it.lastUpdated) < desde) continue;
        const cod = it.clientExpanded && it.clientExpanded.code != null ? String(it.clientExpanded.code) : '';
        if (codigos.has(cod) && typeof it.id === 'string') achadas.push({ cod, id: it.id });
      }
      const ult = itens.length ? dia(itens[itens.length - 1].lastUpdated) : '';
      if (itens.length < 200 || !ult || (desde && ult < desde)) break;
      if (pausa) await pausa(100);
    }
    for (const a of achadas) {
      if (tramites >= maxTramites) { limitada = true; break; }
      tramites++;
      try {
        const d = await fetcher(`${API}${L.tramites}/${a.id}/topics?expand=all&itemsPerPage=1000&orderBy=${encodeURIComponent('created asc')}&pageIndex=0`);
        const u = ultimaAtividadeDoCliente(d, L.cliGrava);
        if (u && (!desde || u >= desde) && u > (porCodigo[a.cod] || '')) porCodigo[a.cod] = u;
      } catch (e) { if (e instanceof AuthError) throw e; /* um trâmite que não abriu não derruba a leitura */ }
      if (pausa) await pausa(80);
    }
  }
  return { porCodigo, lidas, tramites, limitada };
}
