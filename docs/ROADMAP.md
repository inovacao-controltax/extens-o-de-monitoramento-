# Roadmap — do mais fácil ao mais difícil

| Fase | Entrega | Status |
|------|---------|--------|
| 1 | **Visual do hub** no padrão do Control Hub (`DESIGN.md` + `tokens.css`), com dados fictícios | feito |
| 2 | **Configurações** (padrão de nome com teste ao vivo, pastas permitidas, dias sem envio, lista de treinados colada da planilha) salvas no navegador | feito |
| 3 | **Regras de verificação** (`src/rules.js`) com testes, calculadas sobre dados brutos de exemplo e ligadas às configurações salvas | feito |
| 4a | **Modo descoberta do padrão** (cole nomes de arquivos e veja os formatos mais comuns; sugere pastas) e **treinados a partir do Hub** (mesma regra do Portal: concluído ou em andamento, marcando "parcial"). CNPJ alfanumérico aceito | feito |
| 4b | Mapear o portal real com o `docs/roteiro-mapeamento-onvio.md` (quem enviou o arquivo, lista de empresas, último envio, notificações do Gestta) | aguardando o roteiro rodar no Chrome |
| 4c | Leitura real do Onvio (somente GET, mesmas rotas e limites do Control Onvio) | a fazer, depende da 4b |
| 5 | Coleta real do Gestta (usuários e notificações) | a fazer, depende da 4b |
| 6 | Varredura de todas as empresas, histórico, badge e alertas | a fazer |
| 7 | Ações (avisar cliente por e-mail/Zappy), exportação CSV | a fazer |

Ideia geral e arquitetura: veja `IDEIA.md`.
