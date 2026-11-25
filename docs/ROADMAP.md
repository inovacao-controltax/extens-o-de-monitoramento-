# Roadmap — do mais fácil ao mais difícil

| Fase | Entrega | Status |
|------|---------|--------|
| 1 | **Visual do hub** no padrão do Control Hub (`DESIGN.md` + `tokens.css`), com dados fictícios | feito |
| 2 | **Configurações** (padrão de nome com teste ao vivo, pastas permitidas, dias sem envio, lista de treinados colada da planilha) salvas no navegador | feito |
| 3 | **Regras de verificação** (`src/rules.js`) com testes, calculadas sobre dados brutos de exemplo e ligadas às configurações salvas | feito |
| 4a | **Modo descoberta do padrão** (cole nomes de arquivos e veja os formatos mais comuns; sugere pastas) e **treinados a partir do Hub** (mesma regra do Portal: concluído ou em andamento, marcando "parcial"). CNPJ alfanumérico aceito | feito |
| 4b | Mapear o portal real: **a própria extensão faz** (botão "Testar leitura" gera um relatório só com nomes de campos). O `docs/roteiro-mapeamento-onvio.md` continua valendo para o que a extensão não alcança | em teste no Chrome |
| 4c | **Leitura do Onvio pela extensão** (`src/onvio-reader.js`): só GET em lista fechada de rotas do Control Onvio, uma empresa por vez, pela aba logada. Tela "Coleta do Onvio" (testar, coletar com limite, parar, apagar). Painel passa a usar os dados reais | feito nos testes, **a conferir no Onvio real** |
| 4d | **Camada por cima do Onvio**: bolinha, atalho Alt+Shift+M, hub em tela cheia, coleta por trás, selo no ícone, coletar ao abrir (opcional) | feito (testado em Chromium real com Onvio simulado) |
| 5 | Coleta real do Gestta (usuários e notificações) | a fazer, depende da 4b |
| 6 | Varredura de todas as empresas, histórico, badge e alertas | a fazer |
| 7 | Ações (avisar cliente por e-mail/Zappy), exportação CSV | a fazer |

Ideia geral e arquitetura: veja `IDEIA.md`.
