import test from 'node:test';
import assert from 'node:assert/strict';
import { GESTTA_API as G, leituraPermitida, rotuloGestta, criarLeitor, listarFuncionarios, candidatosNotificacao, escolherCampo, valorNoCaminho, contarTarefasAtivas, janelaAtiva, lerFuncionarios, diagnosticarGestta, textoRelatorioGestta } from '../src/gestta-reader.js';
import { AuthError } from '../src/onvio-reader.js';

const id = n => String(n).padStart(24, 'a');
const user = (n, o = {}) => ({ _id: id(n), name: 'Func ' + n, email: `f${n}@x.com`, role: n % 10 === 0 ? 'ROLE_MANAGER' : 'ROLE_USER', active: true, root: false, company_departments: [{ name: 'Pessoal' }],
  permissions: { admin: true }, attempt: 3, last_login: '2026-11-01', notifications: { task_received: n % 3 !== 0, daily_summary: true }, notify_whatsapp: false, ...o });
function fakeGestta({ n = 150, semNotificacao = false, semTotal = false, lista403 = false, tarefas = i => i % 4 } = {}) {
  const usuarios = Array.from({ length: n }, (_, i) => user(i + 1, semNotificacao ? { notifications: undefined, notify_whatsapp: undefined } : {}));
  usuarios[4].active = false;
  const chamadas = [];
  const bruto = async (metodo, url, corpo) => {
    chamadas.push(`${metodo} ${url}`);
    const u = new URL(url), p = u.pathname, j = o => ({ status: 200, ct: 'application/json', body: JSON.stringify(o) });
    if (p === '/core/company/user/me') return j({ _id: id(999), role: 'ROLE_ADMIN', company_departments: [{}, {}], permissions: { x: 1 } });
    if (p === '/admin/company/user') { if (lista403) return { status: 403, ct: 'application/json', body: '{}' }; const pg = +u.searchParams.get('page'), a = usuarios.filter(x => x.active !== false || true); return j({ items: a.slice((pg - 1) * 100, pg * 100), total: a.length }); }
    const m = /^\/admin\/company\/user\/([0-9a-f]{24})$/.exec(p);
    if (m) { const x = usuarios.find(y => y._id === m[1]); return x ? j(x) : { status: 404, ct: 'text/plain', body: '' }; }
    if (p === '/core/customer/task/search') { const i = parseInt(corpo.company_user[0].slice(-3), 16) || 0; return j(semTotal ? { items: [] } : { total: tarefas(i), items: [] }); }
    return { status: 404, ct: 'text/plain', body: '' };
  };
  bruto.chamadas = chamadas; bruto.usuarios = usuarios;
  return bruto;
}

test('lista fechada do Gestta: só estas leituras', () => {
  assert.equal(leituraPermitida('GET', `${G}/core/company/user/me`), true);
  assert.equal(leituraPermitida('GET', `${G}/admin/company/user?active=true&page=1`), true);
  assert.equal(leituraPermitida('GET', `${G}/admin/company/user/${id(1)}`), true);
  assert.equal(leituraPermitida('POST', `${G}/core/customer/task/search`, { page: 1, limit: 1, company_user: ['x'] }), true);
  assert.equal(leituraPermitida('POST', `${G}/core/customer/task/search`, { limit: 500 }), false);
  assert.equal(leituraPermitida('POST', `${G}/core/customer/task/search`, { limit: 1, qualquer: 1 }), false);
  assert.equal(leituraPermitida('PUT', `${G}/admin/company/user/${id(1)}`, {}), false);
  assert.equal(leituraPermitida('DELETE', `${G}/admin/company/user/${id(1)}`), false);
  assert.equal(leituraPermitida('GET', `${G}/admin/company/user/${id(1)}/permissions`), false);
  assert.equal(leituraPermitida('GET', `${G}/core/company/user/timesheet`), false);
  assert.equal(leituraPermitida('GET', 'https://evil.com/admin/company/user'), false);
  assert.equal(leituraPermitida('GET', 'https://api.gestta.com.br.evil.com/admin/company/user'), false);
});
test('leitor: recusa antes de chamar, sem sessão vira AuthError, 503/429 tentam de novo, e o registro não tem ids', async () => {
  let chamou = false;
  await assert.rejects(() => criarLeitor(async () => { chamou = true; return {}; })('DELETE', `${G}/admin/company/user/${id(1)}`), /não permitida/);
  assert.equal(chamou, false);
  await assert.rejects(() => criarLeitor(async () => ({ status: 401, ct: '', body: '', semSessao: true }))('GET', `${G}/core/company/user/me`), AuthError);
  let n = 0; const esperas = [], log = [];
  const l = criarLeitor(async () => (++n === 1 ? { status: 429, ct: '', body: '' } : { status: 200, ct: 'application/json', body: '{"ok":1}' }), { espera: async ms => esperas.push(ms), onChamada: c => log.push(c) });
  assert.deepEqual(await l('GET', `${G}/admin/company/user/${id(7)}?x=1`), { ok: 1 });
  assert.deepEqual(esperas, [3000]);
  assert.equal(log[0].rota, 'GET /admin/company/user/{id}?x'); assert.ok(!JSON.stringify(log).includes(id(7)));
  assert.equal(rotuloGestta(`${G}/admin/company/user/${id(3)}`), '/admin/company/user/{id}');
});
test('funcionários: pagina (150), sem repetir, só campos seguros', async () => {
  const l = criarLeitor(fakeGestta());
  const f = await listarFuncionarios(l);
  assert.equal(f.length, 150); assert.equal(new Set(f.map(x => x.id)).size, 150);
  assert.deepEqual(Object.keys(f[0]).sort(), ['ativo', 'email', 'id', 'nome', 'raiz', 'role', 'setores']);
  assert.ok(!JSON.stringify(f).includes('last_login') && !JSON.stringify(f).includes('permissions'));
});
test('notificação: acha os campos booleanos, ignora o sensível e só escolhe sozinho se houver um candidato forte', () => {
  const d = user(1);
  const c = candidatosNotificacao(d);
  assert.deepEqual(c.map(x => x.caminho).sort(), ['notifications.daily_summary', 'notifications.task_received', 'notify_whatsapp']);
  assert.equal(c.find(x => x.caminho === 'notifications.task_received').forte, true);
  assert.equal(escolherCampo(c), 'notifications.task_received');
  assert.equal(escolherCampo(c, 'notify_whatsapp'), 'notify_whatsapp');              // o configurado vale
  assert.equal(escolherCampo(c, 'campo.que.nao.existe'), 'notifications.task_received');
  const ambiguo = [{ caminho: 'a.notif_task', valor: true, forte: true }, { caminho: 'b.notify_tasks', valor: true, forte: true }];
  assert.equal(escolherCampo(ambiguo), '');
  assert.deepEqual(candidatosNotificacao({ permissions: { notif_x: true }, last_login: true }), [], 'permissões e login nunca entram');
  assert.equal(valorNoCaminho(d, 'notifications.task_received'), true); assert.equal(valorNoCaminho(d, 'nada'), null);
});
test('contagem: devolve o total ou null se a busca não trouxer', async () => {
  assert.equal(await contarTarefasAtivas(criarLeitor(fakeGestta({ tarefas: () => 7 })), id(1), janelaAtiva()), 7);
  assert.equal(await contarTarefasAtivas(criarLeitor(fakeGestta({ semTotal: true })), id(1), janelaAtiva()), null);
  const j = janelaAtiva(new Date('2026-11-25T12:00:00Z'));
  assert.equal(j.start_date.slice(0, 10), '2026-10-01'); assert.equal(j.end_date.slice(0, 10), '2027-01-01');   // fim de dezembro no horário de Brasília (UTC-3), como o Control Onvio
});
test('ler funcionários: marca quem está com a notificação desligada e quantas tarefas tem', async () => {
  const api = fakeGestta(); const prog = [];
  const r = await lerFuncionarios(criarLeitor(api), { onProgresso: p => prog.push(p.feito) });
  assert.equal(r.users.length, 149);                                                     // 1 inativo fora
  assert.equal(r.campo, 'notifications.task_received');
  const desligados = r.users.filter(u => u.notificaTarefa === false);
  assert.ok(desligados.length > 40 && desligados.every(u => /^Func (\d+)$/.test(u.nome) && Number(u.nome.slice(5)) % 3 === 0));
  assert.ok(r.users.every(u => u.tarefasAtivas !== null));
  assert.equal(r.qualidade.falhas, 0); assert.equal(prog.at(-1), 149);
  assert.ok(!JSON.stringify(r).includes('last_login') && !JSON.stringify(r).includes('2026-11-01'));
  assert.ok(Math.max(...prog) === 149);
});
test('ler funcionários: campo configurado vence; sem campo, notificaTarefa fica null (nunca chuta)', async () => {
  const r1 = await lerFuncionarios(criarLeitor(fakeGestta({ n: 12 })), { campo: 'notify_whatsapp' });
  assert.equal(r1.campo, 'notify_whatsapp'); assert.ok(r1.users.every(u => u.notificaTarefa === false));
  const r2 = await lerFuncionarios(criarLeitor(fakeGestta({ n: 12, semNotificacao: true })));
  assert.equal(r2.campo, ''); assert.ok(r2.users.every(u => u.notificaTarefa === null)); assert.equal(r2.qualidade.semCampo, 11);
});
test('ler funcionários: sem acesso ao cadastro (403) dá mensagem clara', async () => {
  await assert.rejects(() => lerFuncionarios(criarLeitor(fakeGestta({ lista403: true }))), /gestor ou administrador/);
});
test('diagnóstico: campos e candidatos, sem valores pessoais; avisa quando não há campo', async () => {
  const log = [];
  const rep = await diagnosticarGestta(criarLeitor(fakeGestta(), { onChamada: c => log.push(c) }), { chamadas: log });
  assert.equal(rep.eu.role, 'ROLE_ADMIN'); assert.equal(rep.funcionarios.total, 150); assert.equal(rep.funcionarios.papeis.ROLE_MANAGER, 15);
  assert.ok(rep.notificacao.candidatos.some(c => c.startsWith('notifications.task_received=') && c.includes('provável')));
  assert.equal(rep.notificacao.escolhido, 'notifications.task_received');
  const t = textoRelatorioGestta(rep);
  for (const proibido of ['Func 1', 'f1@x.com', 'last_login:', 'permissions:', '2026-11-01', 'attempt:']) assert.ok(!t.includes(proibido), proibido);
  assert.match(t, /Chamadas ao Gestta/);
  const rep2 = await diagnosticarGestta(criarLeitor(fakeGestta({ semNotificacao: true })));
  assert.ok(rep2.avisos.some(a => /Aprender chamadas/.test(a)));
  const rep3 = await diagnosticarGestta(criarLeitor(fakeGestta({ semTotal: true })));
  assert.ok(rep3.avisos.some(a => /total/.test(a)));
  const rep4 = await diagnosticarGestta(criarLeitor(fakeGestta({ lista403: true })));
  assert.equal(rep4.passos.at(-1).ok, false); assert.match(rep4.passos.at(-1).detalhe, /gestor ou administrador/);
});

test('Gestta escondendo as tarefas (usuário sem departamento): todas as contagens 0 viram aviso, na leitura e no diagnóstico', async () => {
  const api = fakeGestta({ n: 12, tarefas: () => 0 });
  const r = await lerFuncionarios(criarLeitor(api));
  assert.equal(r.qualidade.todosZero, true);
  const rep = await diagnosticarGestta(criarLeitor(fakeGestta({ n: 12, tarefas: () => 0 })));
  assert.deepEqual(rep.contagem, { amostra: 8, comTarefas: 0, zero: 8, semTotal: 0 });
  assert.ok(rep.avisos.some(a => /departamento vinculado/.test(a)));
  const bom = await lerFuncionarios(criarLeitor(fakeGestta({ n: 12, tarefas: i => 1 + (i % 3) })));
  assert.equal(bom.qualidade.todosZero, false);
});
