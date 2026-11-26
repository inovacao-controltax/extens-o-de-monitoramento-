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
| 8 | **Ligação com o Control Hub** (0.13 a 0.18): treinados vindos direto do Hub (grupo = raiz do CNPJ, só setores com contato), contatos do grupo para o Para e a Cópia do aviso (Hub 435) | feito |
| 9 | **Uso do portal confiável** (0.16 a 0.17): Solicitações contam como uso, autoria exata pela lista de funcionários, leitura adaptativa (~4 min para 1.056 empresas) | feito; autoria conferida no Onvio real (26/11/2026) |
| 10 | **Demanda e grupos** (0.19 a 0.20): alerta padrão de 90 dias, demanda por setor vinda do Hub (436) — parada sem demanda não alerta —, grupos de empresas (Atacapet + RB + YB) | feito; demanda conferida com o Gestta |
| 11 | **Resumo do dia** (0.21): novidades das últimas 24 h e variação desde ontem, sem permissão nova | feito, a conferir no uso |
| 12 | **Padrão de pastas pela empresa modelo 9999** (0.22) | feito, a conferir no Onvio real |
| 13 | Próximos, por decisão do Josué: ler só os meses recentes (leitura mais rápida); parar de ler a pasta Financeiro; notificação do Chrome (exige permissão nova); grupos entre raízes também no Hub | aberto |

Ideia geral e arquitetura: veja `IDEIA.md`.
