# Gestta: o que foi mapeado para o monitor de notificações

> **Atualização:** a configuração de notificação por funcionário que o monitor procura **fica no Onvio** (Configurações › Notificações dos usuários do escritório), não no Gestta. Veja `docs/onvio-notificacoes.md`. O restante deste arquivo continua valendo como mapa do Gestta.

Fonte: leitura real (Testar leitura do Gestta) e "Aprender chamadas" feitos no Gestta de verdade em 25/11/2026. Só rotas e **nomes** de campos; nenhum valor.

## Conclusão: não existe liga/desliga de notificação por funcionário
- **Edição de funcionários** (Detalhes, Departamentos, Transferência): Nome, E-mail, Papel, Telefone, Custo por hora, Ativo, Apenas visualização. Nenhum campo de notificação. Aviso fixo na tela: "Cada colaborador deve ter um e-mail próprio para receber as notificações."
- **Meu perfil**: só Nome, E-mail e Senha.
- **Configure** (menu): Dados da empresa, Tarefas recorrentes, Tarefas de solicitações de serviço, Fluxo de tarefas, Templates de Documentos, Usuários (Funcionários, Usuários de clientes), Responsabilidades, Clientes, **E-mail e WhatsApp** (Templates de envio, SMTP, Endereço customizado), Auditoria. Nenhum item de "Notificações".
- **Cadastro do funcionário** (`GET /admin/company/user/{id}`, 22 campos): os únicos booleanos de notificação são `notify_new_customers.notified` e `notify_customer_changes.notified` (novos clientes e alterações de cliente; **não** são de tarefa).
- **Notificações** (sino): é uma **caixa de entrada** do usuário logado (`POST /nf/notification?limit&page`, `GET /nf/notification/count`), com avisos como "mencionou você em uma recorrente". Não há rota de configuração.

## O que existe e se parece com "notificação de tarefa desativada"
| O que | Rota (leitura) | Campos úteis |
|---|---|---|
| Modelos de tarefa recorrente que **não notificam o cliente** | `GET /admin/company/task?type` | `notify_customer`, `active`, `company_department.name`, `group_customer_count`, `name`, `frequency` |
| Tarefas com notificação ligada mas **sem usuário de cliente** para receber | `POST /core/dashboard/attention/notification-enabled-without-customer-user` (só a contagem); a lista vem da busca de tarefas | corpo: `company_user`, `company_grouper`, `company_task`, `company_department`, `start_date`, `end_date`, `no_owner`, `is_mutual_company_grouper`; resposta: `notification_enabled_without_customer_user` |
| Clientes ativos **sem tarefas ou fluxos** | `GET /admin/customer/count-without-task` | `count` |
| Funcionários **inativos com tarefas** (precisam transferir) | `GET /admin/company/user/pending-transfer` | `count` |
| Modelos de e-mail de envio | `GET /admin/company/email/template` | `name`, `type` (ex.: Conclusão de tarefa, Cobrança de documentos) |
| Responsáveis por cliente de um funcionário | `GET /admin/customer/responsible?company_user` | `customer.name`, `company_department.name` |

## Outras rotas vistas (leitura)
`GET /admin/company/user?active&limit&page&search` (resposta paginada: `docs`, `totalDocs`, `totalPages`), `GET /admin/company/user/{id}/department`, `GET /admin/company/user/{id}/group/customer`, `GET /core/company/user?active&limit`, `GET /admin/company/department`, `GET /core/customer`, `GET /core/company/release`, `GET /es/file/count-pending[/dominio|/onvio]`, e os cartões `POST /core/dashboard/attention/{approve,document-request-sent,email-not-sent,fine,impediment,onvio-documents-not-sent,overdue}`, `POST /core/dashboard/task[/all|/resume|/will-be-fine]`.

## Observação sobre acesso
A lista de funcionários e a busca de tarefas responderam para um usuário `ROLE_USER` **sem departamento vinculado**; nesse caso o Gestta pode esconder as tarefas na busca (contagens 0). Veja o aviso "Nenhum funcionário aparece com tarefas ativas".
