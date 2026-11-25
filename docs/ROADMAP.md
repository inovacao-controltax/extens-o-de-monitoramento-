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
| 4e | **Leitura automática** sem clique, autoria por heurística, só os projetos relevantes, relatório com as chamadas e o motivo de cada falha, alarme falso das pastas padrão do Onvio corrigido | feito (relatório real recebido: 1.056 empresas lidas) |
| 4f | **Leitura ao vivo**: dados parciais no painel desde a 1ª empresa, 4 em paralelo, treinadas primeiro, releitura rápida das treinadas a cada 10 min, sem dados de exemplo enquanto lê | feito (Chromium real: 1º dado em ~3 s, 150 empresas em ~20 s com 100 ms de latência) |
| 4g | Painel sem piscar durante a leitura (sem animação nas atualizações, rolagem preservada, só redesenha o que mudou, tabelas de 200 em 200) e **anel de progresso** no bloco de status que enche conforme a leitura ("84 de 150 · 56%") | feito |
| 5 | **Gestta · notificações desativadas**: leitor só de leitura (token só na página, dados sensíveis nunca lidos), leitura automática, detecção do campo, modo aprender e monitor no painel | feito (testado em Chromium real com Gestta simulado); **a conferir no Gestta real**: onde fica o campo da notificação |
| 5b | **Notificações do escritório (Onvio)**: modo aprender do Onvio (feito); leitura da tela de notificações e monitor com o aviso de nova solicitação desligado | aguardando as chamadas observadas |
| 6 | Varredura de todas as empresas, histórico, badge e alertas | feito (0.12.0): histórico por leitura, "novas" no sino e na bolinha, evolução em 7 dias |
| 7 | Ações (avisar cliente por e-mail/Zappy), exportação CSV | CSV feito (0.12.0); aviso ao cliente feito (0.15.0): rascunho no Zimbra, quem envia é a pessoa |

Ideia geral e arquitetura: veja `IDEIA.md`.
