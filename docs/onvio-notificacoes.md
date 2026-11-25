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
A rota que a tela usa **ainda não foi mapeada** (o mapeamento do Control Onvio também registra "Notificações do Escritório" como não aberta). A extensão tem o **modo aprender do Onvio** (Coleta do Onvio › Aprender chamadas do Onvio): enquanto ligado (2 h, opt-in), registra só método, rota sem ids e nomes de campos das chamadas dessa tela. Com isso a leitura é escrita (somente GET) e o monitor passa a listar os funcionários ativos com o aviso de nova solicitação desligado.

## Correção ao mapeamento do Gestta
O Gestta **não** tem essa configuração por funcionário (ver `docs/gestta-mapeamento.md`). Ela é do Onvio.
