# Roteiro: mapear as duas próximas correções (pastas e notificações)

Uma de cada vez, na ordem: **1) pastas fora do padrão**, depois **2) notificações desligadas**. Use sempre a empresa de teste (9999) e, nas notificações, um usuário de teste seu. O modo aprender registra só método, rota sem ids e **nomes** dos campos (nunca valores, cabeçalhos nem token).

## 1) Renomear uma pasta
1. Hub › Coleta do Onvio › **Aprender chamadas do Onvio (2 h)**.
2. No Onvio (visão do escritório), abra a empresa 9999 › Documentos.
3. Crie uma pasta de teste (ex.: "Contabil teste") dentro de um departamento e **renomeie** pelo próprio Onvio (menu da pasta › Renomear). Se o Onvio também deixar **mover** arquivos entre pastas, faça uma vez com um arquivo de teste.
4. Coleta do Onvio › **Copiar relatório** e enviar o texto inteiro.

O que procuro: `PUT`/`PATCH` em `storage/v1/folders/{id}` (corpo com `name`...). Com isso eu proponho: renomear só quando a pasta é o mesmo nome do padrão com erro de acento, caixa ou espaço (ex.: "Contabil" → "Contábil"), e deixar o resto numa lista para você decidir. Nunca excluir nem mover arquivos sem você pedir.

## 2) Ligar a notificação de nova Solicitação
1. Com o modo aprender ligado, no Onvio vá em **Configurações › Configuração de Notificações dos Usuários do Escritório**.
2. Abra **um usuário de teste** que esteja com "A cada nova Solicitação de Serviço" desmarcada, marque **Via e-mail** e **Via sistema** e clique **Salvar**.
3. Copiar relatório e enviar.

O que procuro: o `PUT`/`POST` em `service-requesting/v1/contact-notifications/{id}` (campos `newTicketEmail` e `newTicketSystem`, já vistos na leitura). Com isso eu proponho ligar só essas duas opções, com a mesma lista fechada, confirmação, um usuário por vez e desfazer.
