import { discoverNames, discoverFolders } from '../src/discovery.js';
import { trainedFromHub } from '../src/hub-sync.js';
import { puxarTreinados, CHAVE_HUB_ESTADO } from '../src/hub-treinados.js';
import { DEFAULT_CONFIG, SETORES, loadConfig, saveConfig, validateConfig, testFileName, parseTrained, mergeTrained, formatCnpj } from '../src/config.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = iso => iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—';
const secClass = s => ({ 'Pessoal': 'sec-pessoal', 'Contábil': 'sec-contabil', 'Fiscal': 'sec-fiscal', 'Financeiro': 'sec-financeiro' }[s] || 'sec-outro');

// Modal de confirmação (nada de confirm() nativo, ver DESIGN.md)
export function confirmModal({ title, text, ok = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    const ov = document.getElementById('overlay');
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">${esc(title)}</h2><p>${esc(text)}</p>
      <div class="actions"><button class="btn" data-r="0" type="button">Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1" type="button">${esc(ok)}</button></div></div>`;
    ov.classList.add('open');
    const prev = document.activeElement;
    const done = v => { ov.classList.remove('open'); document.removeEventListener('keydown', key); prev?.focus?.(); resolve(v); };
    const key = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', key);
    ov.onclick = e => { if (e.target === ov) done(false); };
    ov.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => done(b.dataset.r === '1')));
    ov.querySelector('[data-r="1"]').focus();
  });
}

export async function renderConfig(root, { toast, onSaved }) {
  const saved = await loadConfig();
  let draft = structuredClone(saved);
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
  const $ = s => root.querySelector(s);

  root.innerHTML = `
  <div class="toolbar"><span class="grow" id="dirty"></span>
    <button class="btn" id="restore" type="button">Restaurar padrão</button>
    <button class="btn btn-primary" id="save" type="button">Salvar configurações</button></div>
  <div class="cfg-grid">
    <section class="card"><h2>Padrão de nome de arquivo</h2>
      <div class="field" id="f-pattern"><label for="pattern">Expressão do padrão (regex)</label>
        <input id="pattern" class="num" spellcheck="false" autocomplete="off"><span class="hint" id="h-pattern">Padrão da ControlTax: a competência MM-AAAA antes do nome, por exemplo 10-2026 Folha de pagamento.pdf. O que foge disso é apontado.</span></div>
      <div class="field" id="f-test"><label for="testname">Testar um nome de arquivo</label>
        <div class="row"><input id="testname" placeholder="11-2026 NFE entradas.pdf" autocomplete="off"><span id="testres"></span></div></div></section>
    <section class="card"><h2>Pastas permitidas</h2>
      <p class="note-txt">Pastas de primeiro nível aceitas em cada empresa no portal de documentos.</p>
      <div class="chips" id="chips"></div>
      <div class="field" id="f-folders"><label for="newfolder">Adicionar pasta</label>
        <div class="row"><input id="newfolder" placeholder="Ex.: Societário" autocomplete="off"><button class="btn" id="addfolder" type="button">Adicionar pasta</button></div>
        <span class="hint" id="h-folders"></span></div></section>
    <section class="card"><h2>Clientes sem envio</h2>
      <div class="field" id="f-dias"><label for="dias">Alertar após quantos dias sem envio</label>
        <input id="dias" class="num" type="number" min="1" max="365" inputmode="numeric"><span class="hint" id="h-dias">Vale para clientes já treinados e com demanda.</span></div></section>
    <section class="card wide"><h2>Aviso ao cliente sem uso do portal</h2>
      <p class="note-txt">O botão <b>Avisar</b> da lista de sem envio prepara um rascunho no Zimbra com este texto. A extensão nunca envia: você confere e envia. Não peça documento assinado no texto.</p>
      <div class="field"><label for="msgaviso">Mensagem</label><textarea id="msgaviso" rows="8" class="num" spellcheck="true" placeholder="Deixe em branco para usar o texto padrão"></textarea>
        <span class="hint">Variáveis: {empresa}, {dias}, {ultima} (a data da última atividade) e {assinatura}.</span></div>
      <div class="field"><label for="msgassin">Assinatura</label><input id="msgassin" maxlength="80" autocomplete="off"></div>
      <div class="field"><label for="zimbra">Endereço do Zimbra</label><input id="zimbra" class="num" spellcheck="false" autocomplete="off" placeholder="https://mail.controltax.com.br/"></div></section>
    <section class="card wide"><h2>Descobrir o padrão</h2>
      <p class="note-txt">Cole nomes de arquivos de empresas bem organizadas, um por linha. Com a pasta na frente (Fiscal/2026/11/arquivo.pdf) também sugere as pastas.</p>
      <div class="field"><label for="disc">Nomes ou caminhos de arquivos</label>
        <textarea id="disc" rows="5" class="num" placeholder="2026-11 - NFE - entradas.pdf&#10;Fiscal/2026/10/2026-10 - NFE - saidas.pdf"></textarea></div>
      <div class="row"><button class="btn" id="analisar" type="button">Analisar nomes</button></div>
      <div id="discres"></div></section>
    <section class="card wide"><h2>Puxar do Control Hub</h2>
      <p class="note-txt">Traz sozinho as empresas <b>100% treinadas e com contato</b> direto do Hub e troca a lista abaixo. Precisa do Hub aberto numa aba do claude.ai (logado).</p>
      <div class="field"><label for="hubcod">Código de pareamento do Hub</label>
        <input id="hubcod" class="num" type="password" spellcheck="false" autocomplete="off" placeholder="o mesmo código do Control Onvio">
        <span class="hint">É o mesmo que você cola no Control Onvio (Configurações › Control Hub). Fica só neste navegador e só é entregue ao Hub verdadeiro.</span></div>
      <label class="check"><input type="checkbox" id="hubauto"> Atualizar sozinho (a cada poucas horas) enquanto o Hub estiver aberto</label>
      <div class="row"><button class="btn btn-primary" id="hubpuxar" type="button">Puxar do Hub agora</button></div>
      <p class="note-txt" id="hubest"></p></section>
    <section class="card wide"><h2>Clientes treinados <span class="count" id="tcount"></span></h2>
      <div class="field"><label for="paste">Colar da planilha</label>
        <textarea id="paste" rows="4" class="num" placeholder="Empresa;CNPJ;Treinado em;Demanda&#10;Alfa Ltda;11.222.333/0001-81;01/09/2026;Pessoal, Fiscal"></textarea>
        <span class="hint">Colunas: empresa, CNPJ, treinado em (dd/mm/aaaa) e demanda (Pessoal, Fiscal, Contábil, Financeiro). Separe por ponto e vírgula ou cole direto do Excel. Também aceita o JSON do Hub ({ empresas, contatos }): entram as empresas com treinamento concluído ou em andamento.</span></div>
      <div class="row"><button class="btn" id="import" type="button">Importar lista</button><button class="btn btn-ghost" id="clearT" type="button">Remover todos</button></div>
      <ul class="errs" id="errs"></ul><div id="ttable"></div></section>
  </div>`;

  const setErr = (id, msg) => { const f = $('#f-' + id); f.classList.toggle('has-error', !!msg); if (msg) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); f.addEventListener('animationend', () => f.classList.remove('shake'), { once: true }); } const h = $('#h-' + id); if (h && msg) h.textContent = msg; };
  const refreshDirty = () => { $('#dirty').textContent = dirty() ? 'Alterações não salvas' : 'Tudo salvo'; $('#save').disabled = !dirty(); };

  function test() {
    const r = testFileName(draft.filePattern, $('#testname').value);
    $('#testres').innerHTML = r === null ? '' : r ? '<span class="badge s-ok">Dentro do padrão</span>' : '<span class="badge s-late">Fora do padrão</span>';
  }
  function chips() {
    $('#chips').innerHTML = draft.allowedFolders.map((f, i) => `<span class="chip-x">${esc(f)}<button type="button" data-rm="${i}" aria-label="Remover pasta ${esc(f)}">×</button></span>`).join('') || '<span class="muted">Nenhuma pasta.</span>';
    $('#chips').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { draft.allowedFolders.splice(+b.dataset.rm, 1); chips(); refreshDirty(); }));
  }
  function trained() {
    const t = draft.trained; $('#tcount').textContent = t.length;
    $('#clearT').hidden = !t.length;
    $('#ttable').innerHTML = !t.length
      ? '<div class="empty"><b>Nenhum cliente treinado ainda.</b><p>Cole a lista da planilha de treinamento acima e clique em Importar lista.</p></div>'
      : `<div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th>CNPJ</th><th class="col-sec">Treinado em</th><th>Demanda</th><th></th></tr></thead><tbody>${t.map((x, i) =>
        `<tr><td><span class="emp">${esc(x.empresa)}</span>${x.parcial ? ' <span class="badge s-warn">Parcial</span>' : ''}</td><td class="num">${esc(formatCnpj(x.cnpj))}</td><td class="num col-sec">${fmtDate(x.treinadoEm)}</td><td>${x.demanda.map(s => `<span class="sector ${secClass(s)}">${esc(s)}</span>`).join('') || '<span class="muted">—</span>'}</td><td class="r"><button class="btn btn-ghost btn-sm" data-del="${i}" type="button">Remover</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#ttable').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { draft.trained.splice(+b.dataset.del, 1); trained(); refreshDirty(); }));
  }
  function fill() { $('#msgaviso').value = draft.msgAviso || ''; $('#msgassin').value = draft.msgAssinatura || ''; $('#zimbra').value = draft.zimbraUrl || ''; $('#pattern').value = draft.filePattern; $('#dias').value = draft.diasSemEnvio; chips(); trained(); test(); refreshDirty(); }

  $('#pattern').addEventListener('input', e => { draft.filePattern = e.target.value; setErr('pattern', null); $('#f-pattern').classList.remove('has-error'); $('#h-pattern').textContent = 'Padrão da ControlTax: a competência MM-AAAA antes do nome, por exemplo 10-2026 Folha de pagamento.pdf. O que foge disso é apontado.'; test(); refreshDirty(); });
  $('#testname').addEventListener('input', test);
  $('#msgaviso').addEventListener('input', e => { draft.msgAviso = e.target.value; refreshDirty(); });
  $('#msgassin').addEventListener('input', e => { draft.msgAssinatura = e.target.value; refreshDirty(); });
  $('#zimbra').addEventListener('input', e => { draft.zimbraUrl = e.target.value.trim(); refreshDirty(); });
  $('#dias').addEventListener('input', e => { draft.diasSemEnvio = e.target.value === '' ? NaN : Number(e.target.value); $('#f-dias').classList.remove('has-error'); $('#h-dias').textContent = 'Vale para clientes já treinados e com demanda.'; refreshDirty(); });
  const addFolder = () => {
    const v = $('#newfolder').value.trim(); if (!v) return;
    if (draft.allowedFolders.some(f => f.toLowerCase() === v.toLowerCase())) return setErr('folders', `A pasta "${v}" já está na lista.`);
    draft.allowedFolders.push(v); $('#newfolder').value = ''; $('#f-folders').classList.remove('has-error'); $('#h-folders').textContent = ''; chips(); refreshDirty();
  };
  $('#addfolder').addEventListener('click', addFolder);
  $('#newfolder').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFolder(); } });
  $('#import').addEventListener('click', () => {
    const txt = $('#paste').value;
    let rows, errors;
    if (/^\s*[\[{]/.test(txt)) {
      try { rows = trainedFromHub(JSON.parse(txt)); errors = rows.length ? [] : [{ linha: 1, msg: 'Nenhum cliente 100% treinado e com contato no JSON do Hub.' }]; }
      catch (e) { rows = []; errors = [{ linha: 1, msg: 'JSON inválido. Cole o conteúdo completo exportado do Hub.' }]; }
    } else ({ rows, errors } = parseTrained(txt));
    $('#errs').innerHTML = errors.map(e => `<li>Linha ${e.linha}: ${esc(e.msg)}</li>`).join('');
    if (rows.length) { draft.trained = mergeTrained(draft.trained, rows); trained(); refreshDirty(); }
    if (!rows.length && !errors.length) return toast('Cole ao menos uma linha antes de importar', 'warn');
    if (!errors.length) $('#paste').value = '';
    toast(`${rows.length} cliente(s) importado(s)${errors.length ? `, ${errors.length} linha(s) com erro` : ''}`, errors.length ? 'warn' : 'ok');
  });
  $('#clearT').addEventListener('click', async () => {
    if (await confirmModal({ title: 'Remover todos os clientes treinados?', text: `${draft.trained.length} cliente(s) saem da lista. A mudança só vale depois de clicar em Salvar configurações.`, ok: 'Remover todos', danger: true })) { draft.trained = []; trained(); refreshDirty(); }
  });

  // Puxar do Control Hub: o código e a opção de atualizar sozinho valem na hora (não passam pelo "Salvar configurações").
  const hubSalvar = async parte => { const c = { ...(await loadConfig()), ...parte }; const r = await saveConfig(c); if (r.ok) { Object.assign(saved, parte); Object.assign(draft, parte); } return r.ok; };
  const hubEstado = e => {
    $('#hubest').innerHTML = !e ? 'Ainda não puxou do Hub neste navegador.'
      : e.ok ? `<span class="badge s-ok">Atualizado</span> ${esc(e.msg || '')} <span class="muted">${new Date(e.em).toLocaleString('pt-BR')}</span>`
      : `<span class="badge s-late">Não deu certo</span> ${esc(e.msg || '')}`;
  };
  const adotarLista = async () => { const c = await loadConfig(); if (JSON.stringify(draft.trained) === JSON.stringify(saved.trained)) { draft.trained = structuredClone(c.trained); } saved.trained = structuredClone(c.trained); trained(); refreshDirty(); };
  $('#hubcod').value = saved.hubCodigo || ''; $('#hubauto').checked = saved.hubAuto !== false;
  $('#hubcod').addEventListener('change', e => hubSalvar({ hubCodigo: e.target.value.trim() }));
  $('#hubauto').addEventListener('change', e => hubSalvar({ hubAuto: e.target.checked }));
  $('#hubpuxar').addEventListener('click', async () => {
    $('#hubpuxar').disabled = true; $('#hubest').textContent = 'Perguntando ao Hub…';
    try {
      if (!(await hubSalvar({ hubCodigo: $('#hubcod').value.trim() }))) return toast('Não foi possível salvar o código', 'warn');
      const r = await puxarTreinados(); hubEstado(r);
      if (r.ok) { await adotarLista(); toast(`${r.n} empresas treinadas puxadas do Hub`, 'ok'); } else toast(r.msg, 'warn');
    } finally { $('#hubpuxar').disabled = false; }
  });
  try { chrome.storage.local.get(CHAVE_HUB_ESTADO).then(r => hubEstado(r[CHAVE_HUB_ESTADO] || null)); chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch[CHAVE_HUB_ESTADO]) { hubEstado(ch[CHAVE_HUB_ESTADO].newValue || null); if (ch[CHAVE_HUB_ESTADO].newValue && ch[CHAVE_HUB_ESTADO].newValue.ok) adotarLista(); } }); } catch (e) { /* fora da extensão */ }
  $('#restore').addEventListener('click', async () => {
    if (await confirmModal({ title: 'Restaurar o padrão?', text: 'Padrão de nome, pastas e dias voltam ao exemplo inicial. A lista de clientes treinados é mantida.', ok: 'Restaurar padrão' })) {
      draft = { ...structuredClone(DEFAULT_CONFIG), trained: draft.trained }; fill(); toast('Padrão restaurado, falta salvar');
    }
  });
  $('#save').addEventListener('click', async () => {
    const errs = validateConfig(draft);
    setErr('pattern', errs.filePattern); setErr('folders', errs.allowedFolders); setErr('dias', errs.diasSemEnvio);
    if (Object.keys(errs).length) return toast('Corrija os campos em vermelho para salvar', 'warn');
    const res = await saveConfig(draft);
    if (!res.ok) return toast(res.errors._geral || 'Não foi possível salvar', 'warn');
    Object.assign(saved, structuredClone(draft)); refreshDirty(); toast('Configurações salvas'); onSaved?.(draft);
  });
  function descobrir() {
    const linhas = $('#disc').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!linhas.length) return toast('Cole ao menos um nome de arquivo', 'warn');
    const nomes = linhas.map(l => l.split(/[\\/]/).filter(Boolean).pop());
    const nf = discoverNames(nomes), pf = discoverFolders(linhas);
    const usadas = new Set(draft.allowedFolders.map(f => f.toLowerCase()));
    const tabela = `<div class="tbl-wrap"><table><thead><tr><th>Formato</th><th class="r">Arquivos</th><th class="r">%</th><th>Exemplo</th><th></th></tr></thead><tbody>${nf.formatos.slice(0, 8).map((f, i) =>
      `<tr><td class="num">${esc(f.shape)}${f.exts.length ? '.' + esc(f.exts.join('|')) : ''}</td><td class="num r">${f.count}</td><td class="num r">${f.pct}%</td><td>${esc(f.examples[0])}</td><td class="r"><button class="btn btn-sm" data-use="${i}" type="button">Usar como padrão</button></td></tr>`).join('')}</tbody></table></div>
      <p class="note-txt">${nf.total} nome(s) analisado(s). 9{4} = 4 números; X = texto.</p>`;
    const pastas = pf.pastas.length ? `<h3 class="sub-h">Pastas de primeiro nível</h3><div class="chips">${pf.pastas.map((p, i) =>
      `<span class="chip-x">${esc(p.nome)} <span class="num muted">${p.count} · ${p.pct}%</span>${usadas.has(p.nome.toLowerCase()) ? '' : `<button type="button" data-addf="${i}" aria-label="Adicionar pasta ${esc(p.nome)}" title="Adicionar às pastas permitidas">+</button>`}</span>`).join('')}</div>` : '';
    $('#discres').innerHTML = tabela + pastas;
    $('#discres').querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => {
      draft.filePattern = nf.formatos[+b.dataset.use].regex; $('#pattern').value = draft.filePattern; $('#f-pattern').classList.remove('has-error'); test(); refreshDirty();
      toast('Padrão aplicado, falta salvar');
    }));
    $('#discres').querySelectorAll('[data-addf]').forEach(b => b.addEventListener('click', () => {
      const nome = pf.pastas[+b.dataset.addf].nome; if (!usadas.has(nome.toLowerCase())) { draft.allowedFolders.push(nome); chips(); refreshDirty(); b.remove(); toast(`Pasta "${nome}" adicionada, falta salvar`); }
    }));
  }
  $('#analisar').addEventListener('click', descobrir);
  fill();
}
