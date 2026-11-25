# Ligação direta com o Control Hub (clientes treinados)

Desde a 0.10.0 a extensão puxa a lista de clientes treinados direto do Hub, sem colar planilha.

**Regra (definida pelo Hub 432):** só entram empresas **100% treinadas e com contato**: a empresa tem demanda em algum setor, todo setor da demanda tem contato e todos os contatos do setor estão com o treinamento concluído. Arquivada, de exemplo, excluída e empresas do próprio escritório ficam de fora. O Hub manda só empresa, CNPJ, data do treinamento e setores; nunca contato, e-mail nem nome de pessoa.

**Como liga:** em Configurações › *Puxar do Control Hub*, cole o código de pareamento (o mesmo do Control Onvio) e clique em *Puxar do Hub agora*. Com o Hub aberto numa aba do claude.ai, a lista se atualiza sozinha a cada `horasAuto` (desligue em "Atualizar sozinho"). A lista de treinados é **trocada inteira** pela do Hub.

**Protocolo** (o mesmo da ponte do Control Onvio): o Hub avisa `{ctlhub:1, de:'hub', tipo:'ola'}`; `src/ponte-treinados.js` (só no claude.ai) desafia `{tipo:'busca', nonce}` e só trata como Hub a janela que provar `HMAC-SHA256(código, nonce)`. Então manda `{tipo:'consulta', acao:'treinados', id, token}` e o Hub responde `{tipo:'consultaAck', id, ok, treinados}`. Sem o código certo o Hub responde `token` e nada é entregue. Só leitura; nada é gravado no Hub.

**Se não funcionar:** "Abra o Hub numa aba do claude.ai", "recarregue a aba (F5)" (a aba abriu antes da extensão ser atualizada), "o Hub recusou o código" ou "Hub 432 ou mais novo" (o Hub publicado ainda não tem a ligação).
