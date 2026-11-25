// Dados FICTÍCIOS só para desenhar a interface (Fase 1). Substituídos pela coleta real na Fase 4+.
const d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
export const MOCK = {
  nomenclatura: [
    { empresa: 'Alfa Ltda', cnpj: '11.111.111/0001-11', setor: 'Fiscal', pasta: 'Fiscal/2026/11', arquivo: 'scan0001.pdf', data: d(2) },
    { empresa: 'Beta ME', cnpj: '22.222.222/0001-22', setor: 'Pessoal', pasta: 'Pessoal', arquivo: 'folha novembro final(2).pdf', data: d(5) },
    { empresa: 'Delta Ltda', cnpj: '44.444.444/0001-44', setor: 'Contábil', pasta: 'Contábil', arquivo: 'IMG_2231.jpg', data: d(9) },
  ],
  pastas: [
    { empresa: 'Gama SA', cnpj: '33.333.333/0001-33', pasta: 'Docs Diversos', arquivos: 14 },
    { empresa: 'Épsilon EIRELI', cnpj: '55.555.555/0001-55', pasta: 'NOVA PASTA', arquivos: 3 },
  ],
  semEnvio: [
    { empresa: 'Delta Ltda', cnpj: '44.444.444/0001-44', treinadoEm: d(80), demanda: ['Pessoal', 'Contábil'], dias: null },
    { empresa: 'Gama SA', cnpj: '33.333.333/0001-33', treinadoEm: d(70), demanda: ['Fiscal'], dias: 41 },
    { empresa: 'Zeta Comércio', cnpj: '66.666.666/0001-66', treinadoEm: d(50), demanda: ['Financeiro'], dias: 33 },
  ],
  notificacoes: [
    { nome: 'Maria Souza', setor: 'Pessoal', email: 'maria@exemplo.com', tarefasAtivas: 12 },
    { nome: 'Carlos Lima', setor: 'Fiscal', email: 'carlos@exemplo.com', tarefasAtivas: 7 },
  ],
  coletadoEm: Date.now() - 36e5,
};
