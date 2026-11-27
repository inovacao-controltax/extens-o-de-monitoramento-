# Onvio: notificações dos usuários do escritório

Fonte: capturas de tela do Onvio Portal do Cliente (Configurações), 25/11/2026. Só rótulos de tela; nenhum dado de pessoa.

**Onde fica:** Onvio Portal do Cliente › **Configurações** › *Configuração de Notificações dos Usuários do Escritório*.
- **Lista:** colunas Ações (lápis), Usuário do escritório, **Status (Ativo/Inativo)**, Endereço de e-mail; paginada (199 usuários na conta, 10 por página).
- **Tela de cada usuário** ("Notificações para {nome}", botões Salvar e Cancelar), com caixas de marcar:

| Grupo | Opções |
|---|---|
| **A cada nova Solicitação de Serviço** | Via e-mail · Via sistema |
| A cada trâmite realizado em uma Solicitação de Serviço | Via e-mail e Via sistema, cada uma com "Todos os usuários / Somente desse usuário" |
| A cada trâmite concluído em uma Solicitação de Serviço | Via e-mail e Via sistema, com o mesmo escopo |
| A cada vínculo de responsável em uma Solicitação de Serviço | Via e-mail, com escopo |
| Quando visualizado o documento publicado | Via e-mail |
| Avisos de documentos publicados não visualizados | Via e-mail |
| A cada nova Certidão Negativa de Débito | Via e-mail · Via sistema |
| BOX-e | 4 opções (e-mail mensal por empresa, e-mail mensal com o total, e-mail por arquivo com inconsistência, via sistema por lote) |
| OnBalance | "Alterações a serem notificadas": Conta Financeira, Despesas, Depósitos, Notas Fiscais de Serviço, NF-e, Categoria, Produtos, Impostos, Configuração para Emissão de NFS-e e de NF-e, Transferências |

## O que o monitor deve olhar
"Notificação de quando chega tarefa desativada" = **A cada nova Solicitação de Serviço** com **Via e-mail e Via sistema ambos desmarcados**, para usuário **Ativo**. Secundários: "vínculo de responsável" desmarcado, "trâmite realizado" desmarcado.

## Estado do mapeamento
O modo aprender (25/11/2026) mostrou que a tela chama `GET service-requesting/v1/contact-notifications/{id}` (e `boxe/v1/contact-notifications/{id}` para o BOX-e), ambas **404** no usuário aberto, `POST core/v3/companies/{id}/employees/search` (a lista de 199) e `GET core/v3/companies/{id}/employees/{id}`. A equipe **ativa** vem de `GET br-payroll-sr/v1/employees?itemsPerPage=500&pageIndex=0` (`id`, `contactId`, `name`; o `pageIndex` começa em 0 e página pequena repete itens, mapa do Control Onvio). A sondagem **Testar leitura das notificações** lê `contact-notifications/{contactId}` de uma amostra (códigos HTTP, nomes de campos e contagem sim/não por campo) para descobrir o formato da resposta 200 e o que significa o 404 (provavelmente "sem configuração salva").

**Antes:** a rota que a tela usa **ainda não foi mapeada** (o mapeamento do Control Onvio também registra "Notificações do Escritório" como não aberta). A extensão tem o **modo aprender do Onvio** (Coleta do Onvio › Aprender chamadas do Onvio): enquanto ligado (2 h, opt-in), registra só método, rota sem ids e nomes de campos das chamadas dessa tela. Com isso a leitura é escrita (somente GET) e o monitor passa a listar os funcionários ativos com o aviso de nova solicitação desligado.

## Correção ao mapeamento do Gestta
O Gestta **não** tem essa configuração por funcionário (ver `docs/gestta-mapeamento.md`). Ela é do Onvio.

## Monitor (0.8.0)
- Leitura automática com o Onvio aberto (a cada `horasAuto`, 6 h): toda a equipe ativa (`br-payroll-sr/v1/employees`), uma chamada `GET service-requesting/v1/contact-notifications/{contactId}` por pessoa, 4 de cada vez. Guarda em `monitor-notificacoes` só nome, estado e sim/não (nunca e-mail nem id).
- **200** = configurado: o monitor acha, entre os campos verdadeiro/falso, "nova Solicitação de Serviço" por e-mail e por sistema (ou usa `notifCampoEmail`/`notifCampoSistema`). Desativado = os dois desligados.
- **404** = sem configuração salva (padrão do Onvio). Conta como desativado (`notifPadraoDesligado`, ligado de fábrica desde a 0.8.7): confirmado em 25/11/2026 que quem nunca teve a configuração salva aparece com "nova Solicitação" desmarcada no Onvio. Dá para desligar em Coleta.
- Formato real (conferido em 25/11/2026): `newTicketEmail` e `newTicketSystem` = nova Solicitação de Serviço; `newTopic*` = trâmite. 5 de 104 têm configuração salva (200), os demais 404.

## Regra atual (0.31.0, Josué 27/11/2026: "esse tem que ser o padrão")
**O padrão é a tela do usuário modelo** (de fábrica Patricia Barcelos; Coleta do Onvio › Notificações do escritório › Usuário modelo): "A cada nova Solicitação de Serviço" **desmarcada** (e-mail e sistema); "trâmite realizado" por e-mail, **somente desse usuário**; "trâmite concluído" desmarcado; "vínculo de responsável" por e-mail, somente desse usuário. **Fora do padrão = configuração salva diferente da do modelo**, em qualquer opção (sim/não e as escolhas "todos os usuários / somente desse usuário"), comparadas campo a campo; a lista mostra o que está diferente. **Quem nunca salvou (404) já aparece no Onvio com o padrão e não entra.** Se o modelo nunca salvou, a extensão não tem como ler o padrão e pede para abrir as notificações dele no Onvio e clicar em SALVAR sem mudar nada. A regra anterior ("nova Solicitação desligada é problema", e o `notifPadraoDesligado`) estava invertida e saiu. **Correção (próximo passo):** colocar quem está fora de volta no padrão, depois de mapear a chamada de salvar (modo aprender + SALVAR no modelo).

## Correção: colocar no padrão (0.32.0)
Mapeado em 27/11/2026 (SALVAR nas notificações da Patricia com o modo aprender): o Onvio grava as opções de **Solicitações de Serviço** com o mesmo corpo em `PUT service-requesting/v1/contact-notifications/{contato}` e `PUT br-payroll-sr/v1/contact-notifications/{contato}`: 12 opções sim/não (`newTicket*`, `newTopic*`, `completedTopic*`, `forwardedTopic*`, cada uma com `Email`, `System` e `AllContacts` = "todos os usuários"). As outras seções da tela são outras gravações (`boxe`, `cnd`, `dominio/integration` documentos e OnBalance) e **não são tocadas**. Em Notificações, **Colocar no padrão** deixa as 12 opções iguais às do usuário modelo. Travas (`src/corrigir-notif.js`, testadas com Onvio simulado e em Chromium real): lista fechada (só esses dois PUT, exatamente as 12 opções sim/não); padrão incompleto não corrige; relê a configuração antes e só grava se ainda estiver diferente (quem nunca salvou não é tocado); confirmação com o nome e o que está diferente; a primeira vez só 1; um por vez; para na recusa 401/403 e após 3 erros; gravação só numa das duas fica marcada como parcial; registro com a configuração de antes (`monitor-correcoes-notif`), **Desfazer a última rodada** e histórico com CSV.
