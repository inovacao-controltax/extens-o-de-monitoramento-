import { criarFetcher, abaOnvio, pausa } from '../src/onvio-tab.js';
import { listarClientes, coletar, diagnosticar, textoDoRelatorio, resumirChamadas, diagnosticarNotificacoes, lerNotificacoesEscritorio, idsDaEquipe, diagnosticarAutoria, textoRelatorioAutoria, textoRelatorioNotificacoes, AuthError } from '../src/onvio-reader.js';
import { loadConfig, saveConfig, DEPARTAMENTOS_LIDOS, raizesParaLer } from '../src/config.js';
import { loadSnapshot, saveSnapshot, clearSnapshot, loadSnapshotCompleto, duracaoDe } from '../src/snapshot.js';
import { confirmModal } from './config-view.js';
import { abaGestta, criarLeitorGestta } from '../src/gestta-tab.js';
import { diagnosticarGestta, textoRelatorioGestta } from '../src/gestta-reader.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function renderColeta(root, { toast, onChanged }) {
  let parar = false, rodando = false;
  root.innerHTML = `
  <div class="cfg-grid">
    <section class="card"><h2>Leitura do Onvio</h2>
      <p class="note-txt">A extensão lê o Onvio pela aba que você já abriu e logou com o usuário do escritório. Só leitura, uma empresa por vez, sem guardar senha nem token. Mantenha a aba do Onvio aberta durante a coleta.</p>
      <p id="aba" class="note-txt"></p>
      <div class="field" id="f-lim"><label for="lim">Empresas nesta coleta</label>
        <input id="lim" class="num" type="number" min="0" value="20" inputmode="numeric"><span class="hint">0 = todas as empresas ativas (pode levar vários minutos). Comece com poucas para conferir.</span></div>
      <label class="chk"><input type="checkbox" id="auto"> Ler o Onvio sozinho, em segundo plano, quando os dados têm mais de 6 h (sem precisar clicar)</label>
      <div class="row"><button class="btn" id="testar" type="button">Testar leitura</button><button class="btn" id="autoria" type="button" title="Mostra, numa amostra de empresas, quem a extensão acha que enviou cada arquivo (cliente ou escritório) e se isso bate com a lista de funcionários">Conferir autoria</button><button class="btn btn-primary" id="coletar" type="button">Coletar agora</button><button class="btn btn-ghost" id="parar" type="button" hidden>Parar</button></div>
      <div id="prog" hidden><progress id="bar" max="1" value="0"></progress><span id="progtxt" class="note-txt"></span></div></section>
    <section class="card"><h2>Dados coletados</h2><div id="dados"></div></section>
    <section class="card"><h2>Notificações do escritório (Onvio)</h2>
      <p class="note-txt">O liga/desliga de notificação de cada funcionário fica no Onvio: Configurações › Notificações dos usuários do escritório (por exemplo "A cada nova Solicitação de Serviço › via e-mail / via sistema"). Para a extensão ler isso, ela precisa aprender quais chamadas essa tela faz.</p>
      <ol class="passos"><li>Clique em <b>Aprender chamadas do Onvio (2 h)</b>.</li><li>No Onvio, abra Configurações › Notificações do escritório, depois o lápis de <b>um</b> funcionário (sem salvar nada) e role a tela até o fim.</li><li>Volte aqui e clique em <b>Ver chamadas observadas do Onvio</b>.</li></ol>
      <label class="check"><input type="checkbox" id="notifPadrao"> Contar também quem <b>nunca teve a configuração alterada</b> (no Onvio aparece com os avisos de nova solicitação desmarcados)</label>
      <div class="row"><button class="btn btn-primary" id="testarN" type="button">Testar leitura das notificações</button><button class="btn" id="aprenderO" type="button">Aprender chamadas do Onvio (2 h)</button><button class="btn btn-ghost" id="verObsO" type="button">Ver chamadas observadas do Onvio</button></div></section>
    <section class="card"><h2>Gestta · notificações</h2>
      <p class="note-txt">Lê os funcionários do Gestta pela aba do Gestta que você já abriu (só leitura) e marca quem está com o aviso de tarefa nova desligado. O token do Gestta nunca sai da página.</p>
      <p id="abaG" class="note-txt"></p>
      <div class="field" id="f-campo"><label for="campo">Campo da notificação (opcional)</label>
        <input id="campo" class="num" spellcheck="false" autocomplete="off" placeholder="ex.: notifications.task_received"><span class="hint">Deixe vazio para a extensão detectar sozinha. Se ela não achar, use "Aprender chamadas" abaixo.</span></div>
      <div class="row"><button class="btn" id="testarG" type="button">Testar leitura do Gestta</button><button class="btn" id="aprender" type="button">Aprender chamadas (2 h)</button><button class="btn btn-ghost" id="verObs" type="button">Ver chamadas observadas</button></div>
      <div id="dadosG"></div></section>
    <section class="card wide"><h2>Relatório do teste</h2>
      <p class="note-txt">Mostra só nomes de campos e contagens, nunca nomes de empresas ou pessoas. Pode ser copiado e enviado para ajustar as regras.</p>
      <pre id="rel" class="rel">Clique em "Testar leitura" para ver se a extensão consegue ler o portal.</pre>
      <div class="row"><button class="btn btn-sm" id="copiar" type="button" disabled>Copiar relatório</button></div></section>
  </div>`;
  const $ = s => root.querySelector(s);

  async function aba() {
    try { const t = await abaOnvio(); $('#aba').innerHTML = t ? '<span class="badge s-ok">Aba do Onvio encontrada</span>' : '<span class="badge s-warn">Nenhuma aba do Onvio aberta</span> Abra https://onvio.com.br e faça login.'; }
    catch (e) { $('#aba').textContent = 'Não foi possível procurar a aba do Onvio.'; }
  }
  // Quanto a última leitura completa levou e como o Onvio respondeu (para afinar a velocidade com dados reais; só números e nomes de rota).
  const desempenhoHtml = c => {
    const d = c && c.desempenho; if (!d) return '';
    const rotas = Object.entries(d.porRota || {}).map(([r, n]) => `${esc(r)} ×${n}`).join(' · ');
    return `<h3 class="sub-h">Desempenho da última leitura completa</h3><ul class="kv"><li><span>Tempo</span><b class="num">${duracaoDe(d.ms)}</b></li><li><span>Chamadas ao Onvio</span><b class="num">${d.chamadas} (${d.chamadasPorSegundo}/s)</b></li>
      <li><span>Resposta média</span><b class="num">${d.latenciaMediaMs} ms</b></li><li><span>Limite de chamadas ao mesmo tempo</span><b class="num">pico ${d.limitePico} · final ${d.limiteFinal}</b></li>
      <li><span>Recuos por recusa do Onvio</span><b class="num">${d.recuos}</b></li><li><span>Reduções por lentidão</span><b class="num">${d.reducoesPorLentidao}</b></li>
      <li><span>Empresas recuperadas na 2ª passada</span><b class="num">${d.recuperadas}</b></li></ul><p class="note-txt">${rotas}</p>`;
  };
  async function dados() {
    const s = await loadSnapshot();
    if (!s || s.fonte !== 'onvio') { $('#dados').innerHTML = '<div class="empty"><b>Nenhuma coleta ainda.</b><p>O painel mostra dados de exemplo até a primeira coleta do Onvio.</p></div>'; return; }
    const q = s.qualidade || {};
    $('#dados').innerHTML = `<p class="note-txt">Última coleta: <b>${new Date(s.coletadoEm).toLocaleString('pt-BR')}</b>${s.parcial ? ' <span class="badge s-warn">Parcial</span>' : ''}</p>
      <ul class="kv"><li><span>Empresas lidas</span><b class="num">${q.lidas ?? 0} de ${q.empresas ?? 0}</b></li><li><span>Arquivos</span><b class="num">${q.docs ?? 0}</b></li>
      <li><span>Empresas sem CNPJ</span><b class="num">${q.semCnpj ?? 0}</b></li><li><span>Sem projeto no portal</span><b class="num">${q.semProjeto ?? 0}</b></li>
      <li><span>Falhas de leitura</span><b class="num">${q.falhas ?? 0}</b></li><li><span>Autor do arquivo não identificado</span><b class="num">${q.origemIndefinida ?? 0}</b></li><li><span>Cliente ou escritório, decidido por</span><b>${q.autores && q.autores.metodo === 'equipe' ? 'lista de funcionários (exato)' : q.autores ? 'dedução (use Conferir autoria)' : '—'}</b></li></ul>
      ${desempenhoHtml(await loadSnapshotCompleto())}
      <button class="btn btn-ghost btn-sm" id="apagar" type="button">Apagar dados coletados</button>`;
    $('#apagar').addEventListener('click', async () => {
      if (!await confirmModal({ title: 'Apagar os dados coletados?', text: 'O painel volta a mostrar os dados de exemplo até a próxima coleta.', ok: 'Apagar dados', danger: true })) return;
      await clearSnapshot(); await dados(); onChanged?.(); toast('Dados coletados apagados');
    });
  }
  const ocupado = v => { rodando = v; $('#testar').disabled = v; $('#coletar').disabled = v; $('#parar').hidden = !v; };
  const falha = e => { const msg = e instanceof AuthError ? e.message : `Erro na leitura: ${e.message}`; $('#rel').textContent = msg; toast(msg, 'warn'); };

  $('#testar').addEventListener('click', async () => {
    ocupado(true); $('#rel').textContent = 'Lendo…'; $('#copiar').disabled = true;
    try {
      const cfg = await loadConfig();
      const log = [], f = await criarFetcher({ onChamada: c => log.push(c) });
      const rep = await diagnosticar(f, { pausa, conhecidas: cfg.allowedFolders, chamadas: log, via: f.via });
      rep.via = f.via;
      $('#rel').textContent = textoDoRelatorio(rep); $('#copiar').disabled = false;
      toast(rep.passos.every(p => p.ok) ? 'Leitura funcionando' : 'Leitura com problemas, veja o relatório', rep.passos.every(p => p.ok) ? 'ok' : 'warn');
    } catch (e) { falha(e); } finally { ocupado(false); aba(); }
  });
  $('#copiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#rel').textContent); toast('Relatório copiado'); } catch (e) { toast('Não foi possível copiar. Selecione o texto e copie.', 'warn'); } });
  $('#parar').addEventListener('click', () => { parar = true; $('#parar').disabled = true; });
  $('#coletar').addEventListener('click', async () => {
    const lim = Math.max(0, parseInt($('#lim').value, 10) || 0);
    parar = false; $('#parar').disabled = false; ocupado(true); $('#prog').hidden = false; $('#bar').value = 0; $('#progtxt').textContent = 'Lendo a lista de empresas…';
    try {
      const cfg = await loadConfig(), f = await criarFetcher();
      const conhecidas = cfg.allowedFolders;
      const { clientes, falhaCnd } = await listarClientes(f, { pausa });
      const ativas = clientes.filter(c => !c.inativo && c.ids.length).length;
      const r = await coletar(f, clientes, { limite: lim, pausa, conhecidas, descer: DEPARTAMENTOS_LIDOS, parar: () => parar,
        onProgresso: p => { $('#bar').max = p.total || 1; $('#bar').value = p.feito; $('#progtxt').textContent = `${p.feito} de ${p.total} empresas`; } });
      await saveSnapshot({ fonte: 'onvio', coletadoEm: Date.now(), docs: r.docs, totalEmpresas: ativas, qualidade: r.qualidade, parcial: r.qualidade.interrompida || (lim > 0 && lim < ativas), falhaCnd: falhaCnd || '' });
      await dados(); onChanged?.();
      toast(r.qualidade.interrompida ? 'Coleta interrompida, dados parciais guardados' : `Coleta concluída: ${r.qualidade.lidas} empresas`, r.qualidade.interrompida ? 'warn' : 'ok');
    } catch (e) { falha(e); } finally { ocupado(false); $('#prog').hidden = true; aba(); }
  });
  const cfg0 = await loadConfig(); $('#auto').checked = cfg0.autoLer !== false;
  $('#auto').addEventListener('change', async e => { const c = await loadConfig(); c.autoLer = e.target.checked; const r = await saveConfig(c); toast(r.ok ? (c.autoLer ? 'Vai ler o Onvio sozinho' : 'Leitura automática desligada') : 'Não foi possível salvar', r.ok ? 'ok' : 'warn'); });
  // ---------- Gestta ----------
  async function abaG() { try { const t = await abaGestta(); $('#abaG').innerHTML = t ? '<span class="badge s-ok">Aba do Gestta encontrada</span>' : '<span class="badge s-warn">Nenhuma aba do Gestta aberta</span> Abra https://app.gestta.com.br e faça login: a leitura é automática.'; } catch (e) { $('#abaG').textContent = ''; } }
  async function dadosG() {
    let g = null, e = null;
    try { const r = await chrome.storage.local.get(['monitor-gestta', 'monitor-gestta-estado']); g = r['monitor-gestta']; e = r['monitor-gestta-estado']; } catch (x) { /* fora da extensão */ }
    const linhas = [];
    if (g) { const desl = g.users.filter(u => u.notificaTarefa === false).length; linhas.push(`Gestta lido em <b>${new Date(g.coletadoEm).toLocaleString('pt-BR')}</b>: ${g.users.length} funcionários · campo da notificação: <span class="num">${esc(g.campo || 'não identificado')}</span> · com aviso desligado: <b>${g.campo ? desl : '—'}</b>`); }
    if (e && e.estado !== 'ok') linhas.push(`<span class="badge ${e.estado === 'rodando' ? 's-warn' : 's-late'}">${esc(e.estado === 'rodando' ? 'Lendo' : e.estado === 'sem_acesso' ? 'Sem acesso' : e.estado === 'sem_sessao' ? 'Sem sessão' : 'Erro')}</span> ${esc(e.msg || '')}`);
    $('#dadosG').innerHTML = linhas.length ? `<p class="note-txt">${linhas.join('<br>')}</p>` : '<p class="note-txt">Ainda não leu o Gestta nesta máquina.</p>';
  }
  const cfgG = await loadConfig(); $('#campo').value = cfgG.gesttaCampo || '';
  $('#campo').addEventListener('change', async e => { const c = await loadConfig(); c.gesttaCampo = e.target.value.trim(); const r = await saveConfig(c); toast(r.ok ? 'Campo salvo, o Gestta será lido de novo' : 'Não foi possível salvar', r.ok ? 'ok' : 'warn'); });
  $('#testarG').addEventListener('click', async () => {
    $('#testarG').disabled = true; $('#rel').textContent = 'Lendo o Gestta…'; $('#copiar').disabled = true;
    try {
      const log = [], leitor = await criarLeitorGestta({ onChamada: c => log.push(c) });
      const rep = await diagnosticarGestta(leitor, { chamadas: log, campo: $('#campo').value.trim() });
      $('#rel').textContent = textoRelatorioGestta(rep); $('#copiar').disabled = false;
      toast(rep.passos.every(p => p.ok) ? 'Gestta: leitura funcionando' : 'Gestta: leitura com problemas, veja o relatório', rep.passos.every(p => p.ok) ? 'ok' : 'warn');
    } catch (e) { const m = e instanceof AuthError ? e.message : `Erro na leitura: ${e.message}`; $('#rel').textContent = m; toast(m, 'warn'); }
    finally { $('#testarG').disabled = false; abaG(); }
  });
  $('#aprender').addEventListener('click', async () => {
    await chrome.storage.local.set({ 'monitor-aprender': { ate: Date.now() + 2 * 60 * 60 * 1000 } });
    $('#rel').textContent = 'Modo aprender ligado por 2 horas (enquanto uma aba do Gestta estiver aberta).\n\nAgora, NO GESTTA:\n1. Abra Configure > Funcionários e entre no cadastro de um funcionário.\n2. Abra as telas/abas de notificações dele (sem salvar nada).\n3. Volte aqui e clique em "Ver chamadas observadas".\n\nSó são registrados o método, a rota sem ids e os NOMES dos campos. Nunca valores, token ou cabeçalhos.';
    toast('Modo aprender ligado por 2 h');
  });
  async function mostrarObservadas(chave, titulo) {
    const o = (await chrome.storage.local.get(chave))[chave] || {};
    const lista = Object.values(o).sort((a, b) => Number(/notif|user|alert|aviso/i.test(b.rota)) - Number(/notif|user|alert|aviso/i.test(a.rota)));
    $('#rel').textContent = lista.length ? [`CHAMADAS OBSERVADAS NO ${titulo} (rota sem ids, método, status e nomes de campos; nunca valores)`, '', ...lista.flatMap(c => [`${c.metodo} ${c.rota}  [${c.status}] x${c.n}`, ...(c.corpo && c.corpo.length ? [`    enviado: ${c.corpo.join(', ')}`] : []), ...(c.campos && c.campos.length ? [`    resposta: ${c.campos.slice(0, 40).join(', ')}`] : [])])].join('\n') : 'Nenhuma chamada observada ainda. Ligue "Aprender chamadas", navegue no sistema e volte aqui.';
    $('#copiar').disabled = !lista.length;
  }
  $('#verObs').addEventListener('click', () => mostrarObservadas('monitor-gestta-observadas', 'GESTTA'));
  $('#verObsO').addEventListener('click', () => mostrarObservadas('monitor-onvio-observadas', 'ONVIO'));
  { const c0 = await loadConfig(); $('#notifPadrao').checked = !!c0.notifPadraoDesligado;
    $('#notifPadrao').addEventListener('change', async e => { const c = await loadConfig(); c.notifPadraoDesligado = e.target.checked; const r = await saveConfig(c); toast(r.ok ? 'Salvo: a lista de notificações já considera isso' : 'Não foi possível salvar', r.ok ? 'ok' : 'warn'); }); }
  // Conferir autoria: numa amostra (treinadas primeiro), compara a decisão cliente/escritório pela lista de funcionários com a dedução.
  $('#autoria').addEventListener('click', async () => {
    $('#autoria').disabled = true; $('#rel').textContent = 'Conferindo a autoria numa amostra de empresas…'; $('#copiar').disabled = true;
    try {
      const f = await criarFetcher(), cfgA = await loadConfig();
      const guardado = (await chrome.storage.local.get('monitor-clientes'))['monitor-clientes'];
      const clientes = guardado && guardado.clientes && guardado.clientes.length ? guardado.clientes : (await listarClientes(f, { pausa })).clientes;
      const equipeIds = await idsDaEquipe(f).catch(e => { if (e instanceof AuthError) throw e; return null; });
      const prioridade = new Set([...(cfgA.trained || []).map(t => t.cnpj), ...raizesParaLer(cfgA.trained)]);
      const rep = await diagnosticarAutoria(f, clientes, { amostra: 12, prioridade, equipeIds, conhecidas: cfgA.allowedFolders, descer: DEPARTAMENTOS_LIDOS, pausa });
      $('#rel').textContent = textoRelatorioAutoria(rep); $('#copiar').disabled = false;
      toast(rep.vinculo ? 'Autoria exata: bate com a lista de funcionários' : 'Autoria por dedução: veja o relatório', rep.vinculo ? 'ok' : 'warn');
    } catch (e) { const m = e instanceof AuthError ? e.message : `Erro na leitura: ${e.message}`; $('#rel').textContent = m; toast(m, 'warn'); }
    finally { $('#autoria').disabled = false; }
  });
  $('#testarN').addEventListener('click', async () => {
    $('#testarN').disabled = true; $('#rel').textContent = 'Lendo as notificações da equipe do escritório…'; $('#copiar').disabled = true;
    try {
      const log = [], f = await criarFetcher({ onChamada: c => log.push(c) });
      const c1 = await loadConfig();
      const lido = await lerNotificacoesEscritorio(f, { pausa, campos: { email: c1.notifCampoEmail, sistema: c1.notifCampoSistema } });   // guarda ANTES do relatório, para a aba Notificações já estar preenchida
      await chrome.storage.local.set({ 'monitor-notificacoes': { fonte: 'onvio', em: Date.now(), total: lido.total, campos: lido.campos, itens: lido.itens } });
      $('#rel').textContent = 'Guardado. Montando o relatório…';
      const rep = await diagnosticarNotificacoes(f, { pausa, chamadas: log, via: f.via });
      $('#rel').textContent = textoRelatorioNotificacoes(rep) + `\n\nGuardado para a aba Notificações: ${lido.itens.length} funcionários (${lido.itens.filter(i => i.estado === 'configurado').length} com configuração salva).`; $('#copiar').disabled = false;
      toast(rep.passos.every(p => p.ok) ? 'Notificações: leitura funcionando' : 'Notificações: veja o relatório', rep.passos.every(p => p.ok) ? 'ok' : 'warn');
    } catch (e) { const m = e instanceof AuthError ? e.message : `Erro na leitura: ${e.message}`; $('#rel').textContent = m; toast(m, 'warn'); }
    finally { $('#testarN').disabled = false; aba(); }
  });
  $('#aprenderO').addEventListener('click', async () => {
    await chrome.storage.local.set({ 'monitor-aprender': { ate: Date.now() + 2 * 60 * 60 * 1000 } });
    $('#rel').textContent = 'Modo aprender ligado por 2 horas (vale para o Onvio e o Gestta, enquanto houver aba aberta).\n\nAgora, NO ONVIO (Portal do Cliente, visão do escritório):\n1. Abra Configurações > Notificações dos usuários do escritório.\n2. Clique no lápis de UM funcionário e role a tela até o fim (NÃO clique em Salvar).\n3. Volte aqui e clique em "Ver chamadas observadas do Onvio".\n\nSó são registrados o método, a rota sem ids e os NOMES dos campos. Nunca valores, token ou cabeçalhos.\nSe a tela já estava aberta, dê F5 nela para o modo valer.';
    toast('Modo aprender ligado por 2 h');
  });
  await abaG(); await dadosG();
  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch['monitor-gestta'] || ch['monitor-gestta-estado'])) dadosG(); }); } catch (e) { /* nada */ }
  await aba(); await dados();
}
