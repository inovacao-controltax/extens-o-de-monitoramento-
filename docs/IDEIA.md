# Hub de Monitoramento do Portal — ideia e plano

## O que resolve
Quatro verificações automáticas, lendo do Onvio Portal do Cliente e do Gestta, mostradas num hub:

| # | Monitor | Fonte | Regra |
|---|---------|-------|-------|
| 1 | Nomenclatura de arquivos | Onvio > Documentos | Arquivo enviado pelo cliente não bate com o regex do padrão |
| 2 | Pasta fora do padrão | Onvio > Documentos | Pasta de 1º nível da empresa não está na lista permitida |
| 3 | Treinado e sem envio | Onvio + lista de treinados | Cliente treinado, com demanda, sem envio do cliente há > N dias (ou nunca) |
| 4 | Notificação desativada | Gestta > Usuários | Funcionário com aviso de "nova tarefa" desligado (e tarefas ativas) |

## Arquitetura (MV3)
- `src/collectors/*` — content scripts que leem a página já logada (sem guardar senha).
- `src/background.js` — abre o hub, orquestra a coleta, alarme horário atualiza o badge com o nº de pendências.
- `src/rules.js` — regras puras (testáveis em Node), fonte única dos critérios.
- `hub/` — painel com cards, listas por pendência e configurações (regex, pastas, dias, CSV de treinados).
- Dados em `chrome.storage.local` (nada sai do navegador).

## O que falta (próximos passos)
1. **Padrão de nomenclatura (definido em 25/11/2026)**: `MM-AAAA nome do arquivo` (competência antes do nome; o que foge disso está errado). Falta ainda a árvore oficial de pastas.
2. **Seletores/endpoints reais**: inspecionar Onvio e Gestta; preferir a API interna (fetch com a sessão) à raspagem de DOM. As skills `controltax-coleta-solicitacoes-onvio` e `gestta-*` já documentam essas armadilhas.
3. **Varredura de todas as empresas**: hoje coleta a página aberta; evoluir para um modo que percorre empresa por empresa (com pausa/limite para não sobrecarregar o portal).
4. **Lista de treinados**: importar da planilha de checklist de treinamento.
5. **Histórico**: guardar snapshots por data para tendência (evolução mensal) e exportar CSV.
6. **"Trazer para o hub no portal do cliente"**: confirmar se significa (a) este painel da extensão (feito) ou (b) injetar um bloco dentro de uma página do portal — (b) é possível via content script, mas depende de onde.
7. **Ações**: botão "avisar cliente" (e-mail/Zappy) a partir de cada pendência.

## Como testar
`chrome://extensions` → Modo desenvolvedor → Carregar sem compactação → pasta do projeto → clicar no ícone → "Carregar dados de exemplo".
