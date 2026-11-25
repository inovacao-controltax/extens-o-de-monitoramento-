// Dados BRUTOS de exemplo (Fase 3). As pendências são calculadas por src/rules.js.
// Nas Fases 4 e 5 isto é substituído pela coleta real do Onvio e do Gestta, no mesmo formato.
const ago = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const D = (empresa, cnpj, pasta, arquivo, dias, origem = 'cliente') => ({ empresa, cnpj, pasta, arquivo, data: ago(dias), origem });

export const SAMPLE = {
  totalEmpresas: 20,
  coletadoEm: Date.now() - 36e5,
  docs: [
    D('Alfa Ltda', '11111111000111', 'Fiscal/2026/11', '2026-11 - NFE - entradas.pdf', 3),
    D('Alfa Ltda', '11111111000111', 'Fiscal/2026/11', 'scan0001.pdf', 2),
    D('Beta ME', '22222222000122', 'Pessoal', 'folha novembro final(2).pdf', 5),
    D('Iota Ltda', '88888888000188', 'Contábil', 'IMG_2231.jpg', 9),
    D('Delta Ltda', '44444444000144', 'Contábil', 'balancete.pdf', 8, 'escritorio'),
    D('Gama SA', '33333333000133', 'Docs Diversos', '2026-10 - OUTROS - contrato.pdf', 41),
    D('Gama SA', '33333333000133', 'Docs Diversos', '2026-10 - OUTROS - aditivo.pdf', 45),
    D('Gama SA', '33333333000133', 'Docs Diversos', '2026-09 - OUTROS - procuracao.pdf', 60),
    D('Épsilon EIRELI', '55555555000155', 'NOVA PASTA', '2026-11 - FIN - extrato.pdf', 4),
    D('Zeta Comércio', '66666666000166', 'Financeiro/2026/10', '2026-10 - FIN - extrato.pdf', 33),
  ],
  trained: [
    { empresa: 'Alfa Ltda', cnpj: '11111111000111', treinadoEm: ago(85), demanda: ['Fiscal'] },
    { empresa: 'Delta Ltda', cnpj: '44444444000144', treinadoEm: ago(80), demanda: ['Pessoal', 'Contábil'] },
    { empresa: 'Gama SA', cnpj: '33333333000133', treinadoEm: ago(70), demanda: ['Fiscal'] },
    { empresa: 'Zeta Comércio', cnpj: '66666666000166', treinadoEm: ago(50), demanda: ['Financeiro'] },
    { empresa: 'Eta Serviços', cnpj: '77777777000177', treinadoEm: ago(10), demanda: ['Pessoal'] },
  ],
  notif: { fonte: 'exemplo', total: 4, itens: [
    { nome: 'Maria Souza', estado: 'configurado', email: false, sistema: false },
    { nome: 'Carlos Lima', estado: 'configurado', email: false, sistema: false },
    { nome: 'João Alves', estado: 'configurado', email: true, sistema: true },
    { nome: 'Ana Reis', estado: 'padrao', email: null, sistema: null },
  ] },
  users: [
    { nome: 'Maria Souza', setor: 'Pessoal', email: 'maria@exemplo.com', notificaTarefa: false, tarefasAtivas: 12 },
    { nome: 'Carlos Lima', setor: 'Fiscal', email: 'carlos@exemplo.com', notificaTarefa: false, tarefasAtivas: 7 },
    { nome: 'João Alves', setor: 'Contábil', email: 'joao@exemplo.com', notificaTarefa: true, tarefasAtivas: 8 },
    { nome: 'Ana Reis', setor: 'Financeiro', email: 'ana@exemplo.com', notificaTarefa: false, tarefasAtivas: 0 },
  ],
  recados: [
    { id: 'r1', titulo: 'Padrão de nome ainda é um exemplo', texto: 'As verificações já usam o padrão salvo em Configurações. Troque o exemplo pelo padrão oficial da ControlTax.' },
    { id: 'r2', titulo: 'Dados de exemplo', texto: 'Nada aqui veio do Onvio ainda. Clique em "Coletar do Onvio" (com o Onvio aberto e logado). O Gestta chega na próxima fase.' },
  ],
};
