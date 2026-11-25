# Roteiro: mapear o portal para a Fase 4b (só leitura)

Cole o texto abaixo no Claude com acesso ao Chrome, já logado no **Onvio com o usuário do escritório** (e no Gestta, para a parte 6).
Devolva o relatório em Markdown. **Nada de nomes de empresa, de pessoa, CNPJ, CPF, token ou cookie**: use "Empresa A", "Usuário 1".

```
Você vai mapear, SÓ LENDO, como o portal de documentos do Onvio e o Gestta guardam o que preciso para uma extensão de monitoramento.
Regras: apenas navegar e fazer requisições GET (e POST só de busca, se a própria tela fizer). Não crie, edite, baixe, envie nem exclua nada.
Não anote tokens, cookies, valores de campos escondidos, nomes reais de empresas ou pessoas, CNPJ ou CPF. Anote nomes de campos, tipos e formatos.

PARTE 1 · Quem enviou o arquivo
Abra Documentos (https://onvio.com.br/staff/#/documents/...) numa empresa que recebe arquivos do cliente.
1. Em qual aba aparecem os arquivos que o CLIENTE publica (Documentos do Cliente, Documentos do Escritório, Comunicações...)? Descreva como diferenciar "enviado pelo cliente" de "enviado pelo escritório".
2. Na resposta de storage/v2/Folders/{id}/children, quais campos dizem quem criou/enviou o arquivo (createdBy, createdByUserId, addedBy, tipo de usuário...)? Existe campo que distinga usuário de cliente e de escritório? Liste os nomes dos campos de um documento e de uma pasta.

PARTE 2 · Lista de empresas
3. Qual chamada lista todas as empresas/clientes e traz o CNPJ (core/v3/companies/{id}/clients/search?). Campos: id, nome, CNPJ, situação ativo/inativo. O CNPJ vem numérico ou alfanumérico? Como paginar? Quantos itens por página no máximo?
4. Como ligar o cliente à sua pasta raiz (storage/v1/projects?primaryAssociationId=...&primaryAssociationType=Client)? Dá para buscar a raiz de vários clientes de uma vez?

PARTE 3 · Pastas e nomes (para descobrir o padrão)
5. Em 3 empresas bem organizadas (A, B, C), anote SÓ os nomes das pastas de primeiro e segundo nível e 10 nomes de arquivo de cada uma, trocando qualquer nome de empresa ou pessoa por X. O padrão se repete entre as empresas?
6. O campo name do arquivo traz a extensão? Os nomes vêm com acento e espaços como na tela?

PARTE 4 · Último envio do cliente (o mais importante)
7. Existe uma forma barata de saber a data do último arquivo enviado pelo cliente SEM abrir pasta por pasta? Teste storage/v1/containers/documents/search e /count (formato do pedido e da resposta, se aceita filtro por data de criação e por quem criou, se funciona sem informar cliente). Anote se é GET ou POST.
8. Como é a paginação do children: from, pageSize, hasMore? Tamanho máximo de página? Existe limite de taxa (HTTP 429) ou erro 412 ao ler muitas pastas seguidas?

PARTE 5 · Árvore de pastas inteira
9. storage/v1/folders?includeTaxAccounting devolve a árvore de pastas com contagens. Ela traz nome da pasta, criada por, alterada em, documentCount de TODAS as empresas de uma vez? Serve para achar "pasta fora do padrão" sem ler arquivo por arquivo?

PARTE 6 · Gestta (app.gestta.com.br) · funcionários e notificação de tarefa
10. Em Configure > Funcionários (admin), abra um funcionário. Onde fica a opção de receber notificação/e-mail quando chega tarefa nova? Qual o nome do campo na API (anote o caminho do GET e o nome da chave, sem valores)?
11. Existe uma lista que traga, para todos os funcionários, esse campo de uma vez? Quantos funcionários e quantas tarefas ativas por funcionário (GET de tarefas por responsável)?

ENTREGA
Um Markdown com as partes 1 a 6, uma tabela "Rotas" (método, caminho com {id}, para que serve, status HTTP) e uma lista "Não consegui" com o que ficou de fora e por quê.
```

## O que cada parte destrava
| Parte | Destrava |
|---|---|
| 1 | Separar "enviado pelo cliente" de "enviado pelo escritório" (as regras de nomenclatura e de treinados sem envio dependem disso) |
| 2 | Lista de empresas com CNPJ para casar com os treinados do Hub |
| 3 | O padrão oficial de nome e de pastas (junto com o modo descoberta das Configurações) |
| 4 | Data do último envio por empresa, sem varrer o portal inteiro |
| 5 | Pastas fora do padrão numa só leitura |
| 6 | Monitor de notificações desativadas |
