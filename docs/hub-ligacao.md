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
