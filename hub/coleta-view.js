import { criarFetcher, abaOnvio, pausa } from '../src/onvio-tab.js';
import { listarClientes, coletar, diagnosticar, textoDoRelatorio, AuthError } from '../src/onvio-reader.js';
import { loadConfig, saveConfig, SETORES } from '../src/config.js';
import { loadSnapshot, saveSnapshot, clearSnapshot } from '../src/snapshot.js';
import { confirmModal } from './config-view.js';

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
      <label class="chk"><input type="checkbox" id="auto"> Coletar sozinho ao abrir por cima do Onvio (se os dados têm mais de 6 h)</label>
      <div class="row"><button class="btn" id="testar" type="button">Testar leitura</button><button class="btn btn-primary" id="coletar" type="button">Coletar agora</button><button class="btn btn-ghost" id="parar" type="button" hidden>Parar</button></div>
      <div id="prog" hidden><progress id="bar" max="1" value="0"></progress><span id="progtxt" class="note-txt"></span></div></section>
    <section class="card"><h2>Dados coletados</h2><div id="dados"></div></section>
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
  async function dados() {
    const s = await loadSnapshot();
    if (!s || s.fonte !== 'onvio') { $('#dados').innerHTML = '<div class="empty"><b>Nenhuma coleta ainda.</b><p>O painel mostra dados de exemplo até a primeira coleta do Onvio.</p></div>'; return; }
    const q = s.qualidade || {};
    $('#dados').innerHTML = `<p class="note-txt">Última coleta: <b>${new Date(s.coletadoEm).toLocaleString('pt-BR')}</b>${s.parcial ? ' <span class="badge s-warn">Parcial</span>' : ''}</p>
      <ul class="kv"><li><span>Empresas lidas</span><b class="num">${q.lidas ?? 0} de ${q.empresas ?? 0}</b></li><li><span>Arquivos</span><b class="num">${q.docs ?? 0}</b></li>
      <li><span>Empresas sem CNPJ</span><b class="num">${q.semCnpj ?? 0}</b></li><li><span>Sem projeto no portal</span><b class="num">${q.semProjeto ?? 0}</b></li>
      <li><span>Falhas de leitura</span><b class="num">${q.falhas ?? 0}</b></li><li><span>Autor do arquivo não identificado</span><b class="num">${q.origemIndefinida ?? 0}</b></li></ul>
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
      const rep = await diagnosticar(await criarFetcher(), { pausa, conhecidas: [...cfg.allowedFolders, ...SETORES] });
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
      const conhecidas = [...cfg.allowedFolders, ...SETORES];
      const { clientes, falhaCnd } = await listarClientes(f, { pausa });
      const ativas = clientes.filter(c => !c.inativo && c.ids.length).length;
      const r = await coletar(f, clientes, { limite: lim, pausa, conhecidas, parar: () => parar,
        onProgresso: p => { $('#bar').max = p.total || 1; $('#bar').value = p.feito; $('#progtxt').textContent = `${p.feito} de ${p.total} empresas`; } });
      await saveSnapshot({ fonte: 'onvio', coletadoEm: Date.now(), docs: r.docs, totalEmpresas: ativas, qualidade: r.qualidade, parcial: r.qualidade.interrompida || (lim > 0 && lim < ativas), falhaCnd: falhaCnd || '' });
      await dados(); onChanged?.();
      toast(r.qualidade.interrompida ? 'Coleta interrompida, dados parciais guardados' : `Coleta concluída: ${r.qualidade.lidas} empresas`, r.qualidade.interrompida ? 'warn' : 'ok');
    } catch (e) { falha(e); } finally { ocupado(false); $('#prog').hidden = true; aba(); }
  });
  const cfg0 = await loadConfig(); $('#auto').checked = !!cfg0.autoColetar;
  $('#auto').addEventListener('change', async e => { const c = await loadConfig(); c.autoColetar = e.target.checked; const r = await saveConfig(c); toast(r.ok ? (c.autoColetar ? 'Vai coletar sozinho ao abrir' : 'Coleta só quando você pedir') : 'Não foi possível salvar', r.ok ? 'ok' : 'warn'); });
  await aba(); await dados();
}
