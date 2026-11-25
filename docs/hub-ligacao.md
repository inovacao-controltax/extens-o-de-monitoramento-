# Ligação direta com o Control Hub (clientes treinados)

Desde a 0.10.0 a extensão puxa a lista de clientes treinados direto do Hub, sem colar planilha.

**Regra (definida pelo Hub 432):** só entram empresas **100% treinadas e com contato**: a empresa tem demanda em algum setor, todo setor da demanda tem contato e todos os contatos do setor estão com o treinamento concluído. Arquivada, de exemplo, excluída e empresas do próprio escritório ficam de fora. O Hub manda só empresa, CNPJ, data do treinamento e setores; nunca contato, e-mail nem nome de pessoa.

**Como liga:** em Configurações › *Puxar do Control Hub*, cole o código de pareamento (o mesmo do Control Onvio) e clique em *Puxar do Hub agora*. Com o Hub aberto numa aba do claude.ai, a lista se atualiza sozinha a cada `horasAuto` (desligue em "Atualizar sozinho"). A lista de treinados é **trocada inteira** pela do Hub.

**Protocolo** (o mesmo da ponte do Control Onvio): o Hub avisa `{ctlhub:1, de:'hub', tipo:'ola'}`; `src/ponte-treinados.js` (só no claude.ai) desafia `{tipo:'busca', nonce}` e só trata como Hub a janela que provar `HMAC-SHA256(código, nonce)`. Então manda `{tipo:'consulta', acao:'treinados', id, token}` e o Hub responde `{tipo:'consultaAck', id, ok, treinados}`. Sem o código certo o Hub responde `token` e nada é entregue. Só leitura; nada é gravado no Hub.

**Se não funcionar:** "Abra o Hub numa aba do claude.ai", "recarregue a aba (F5)" (a aba abriu antes da extensão ser atualizada), "o Hub recusou o código" ou "Hub 432 ou mais novo" (o Hub publicado ainda não tem a ligação).

## Treinados sem envio (0.11.0)
**O que é "enviar":** o que importa é saber se o cliente **está usando o portal** (Josué, 25/11/2026). Conta qualquer arquivo do cliente em Pessoal, Fiscal, Contábil e Financeiro **e** qualquer ação do cliente nas Solicitações de Serviço (abrir solicitação geral, lançar rubrica, cadastrar, responder), com ou sem anexo. Vale o mais recente dos dois, na **empresa toda**; passou de 30 dias (`diasSemEnvio`), entra na lista.
**Solicitações:** leitura só de GET, a cada hora, só das empresas treinadas: as 10 listas por "última atualização" até sair da janela de 30 dias e os trâmites das solicitações dessas empresas. O lado de cada trâmite (cliente ou escritório) vem da situação que ele gravou, a mesma regra do Control Onvio. Guarda só CNPJ → data (`monitor-solicitacoes`).
**Silenciar:** o botão em cada linha tira a empresa da lista por 15, 30, 60 ou 90 dias, ou sem data, com motivo (sem movimento, férias coletivas…). Vencida a data, ela volta sozinha; "Ver silenciadas" lista e devolve.
**A conferir no Onvio real:** a regra de lado do trâmite e o campo `clientExpanded.code` nas 10 listas.

## Histórico e alertas (0.12.0)
A cada leitura nova a extensão compara as pendências com as da leitura anterior (`monitor-historico`: só chaves e contagens, 14 dias). O que **apareceu de novo** vira "Nova" no sino do painel e num ponto vermelho com o número na bolinha sobre o Onvio; **Marcar como vistas** zera o aviso. O painel também mostra a evolução de cada monitor contra 7 dias atrás. A primeira leitura de cada monitor só marca o ponto de partida (nada é novo) e uma leitura em andamento não vira "tudo novo". **Exportar CSV** (tela Hoje) baixa as pendências que estão na tela, respeitando busca e setor.

**Ordem das leituras (0.12.0):** um ciclo por vez: notificações da equipe e treinados do Hub (leves), depois a leitura principal das empresas e só então as Solicitações e o histórico. Nada roda em paralelo com a leitura principal, e as Solicitações nunca refazem a lista de clientes.

## Leitura mais rápida (0.13.0)
Mesmo resultado, em menos tempo: 8 empresas por vez (antes 4), as pastas da mesma empresa lidas juntas (4 por vez, antes uma de cada vez) e sem as pausas fixas entre pastas, páginas e empresas. Um **limite geral de 10 chamadas ao Onvio ao mesmo tempo** protege a conta: se o Onvio responder 429/502/503/504, o limite cai pela metade (mínimo 2) e volta a subir de um em um depois de 25 respostas boas. Numa API simulada com latência, 100 empresas com o mesmo número de chamadas e os mesmos 16.200 arquivos foram lidas **5,4 vezes mais rápido** (25,2 s contra 4,6 s em escala 1/10). O ganho real no Onvio depende da latência dele; a conferir com as 1.056 empresas.

## Confiabilidade e velocidade (0.14.0)
- **Números estáveis:** a leitura em andamento grava parciais; o painel passa a mostrar a **última coleta completa** (`monitor-snapshot-completo`) enquanto a nova não termina, e troca só quando ela termina. Na primeira leitura (sem completa) os números ainda crescem e a tela avisa.
- **Últimos envios:** nova tela no menu com todas as empresas lidas e a data do último arquivo do cliente (e, nas treinadas, da última atividade em Solicitações), das que estão há mais tempo sem enviar para as mais recentes; as treinadas aparecem mesmo sem nada lido.
- **Lista de treinados vazia:** o monitor diz o que fazer, com o botão **Puxar do Hub agora**; e **nunca** troca uma lista existente por uma vazia vinda do Hub.
- **Velocidade:** 12 empresas por vez, limite geral de 16 chamadas ao Onvio (cai pela metade em 429/502/503/504), páginas de 500 itens por pasta (volta a 100 e lembra se o Onvio recusar) e previsão de término na barra ("faltam ~N min"). Na simulação, 8,6 vezes mais rápido, mesmo resultado.
- **Segunda chance:** a empresa que falha na leitura é lida de novo no fim; só falha de verdade quem falhar duas vezes (`recuperadas` no resumo da leitura).

## Limite que se ajusta sozinho (0.14.1)
O limite de chamadas ao Onvio ao mesmo tempo (`limitado`) começa baixo (6, para medir a resposta do Onvio sem congestionar), **sobe de um em um** enquanto o tempo de resposta fica perto do melhor já visto e **desce** quando a resposta passa de 1,8 vezes o melhor; em 429/502/503/504 cai pela metade. Máximo 32; 24 empresas em andamento para alimentar o limite. Em simulação com o Onvio saturando cedo (8 chamadas), o limite fixo em 16 levou 13,1 s, o fixo em 10 levou 8,1 s e o adaptativo 6,4 s; saturando só em 40, o adaptativo levou 1,3 s contra 3,7 s do fixo em 10. Cada leitura completa registra o **desempenho** (tempo, chamadas e por segundo, resposta média, limite pico e final, recuos, rotas mais chamadas) em Coleta do Onvio, só números e nomes de rota, para afinar com dados reais.
