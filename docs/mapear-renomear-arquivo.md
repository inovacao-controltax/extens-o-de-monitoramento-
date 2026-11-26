# Mapear: renomear um arquivo no Onvio (para a correção automática de nomes)

A extensão hoje só lê o Onvio. Para corrigir nomes sozinha ela precisa saber **qual chamada a própria tela do Onvio faz ao renomear um arquivo**. O modo aprender registra só o método, a rota sem ids e os **nomes** dos campos (nunca valores, cabeçalhos nem token).

Use uma **empresa de teste** (a 9999 serve) e um arquivo de teste seu.

1. Hub › **Coleta do Onvio** › **Aprender chamadas do Onvio (2 h)**.
2. No Onvio (visão do escritório), abra a empresa de teste › Documentos.
3. **Renomeie um arquivo de teste** pelo próprio Onvio (menu do arquivo › Renomear / Editar) e salve.
4. Se o Onvio também deixar renomear **pasta**, faça uma vez com uma pasta de teste.
5. Volte à Coleta do Onvio e clique **Copiar relatório**. Envie aqui o texto inteiro.

O que procuro no relatório: um `PUT`, `PATCH` ou `POST` em `storage/...` com os campos do corpo (por exemplo `name`). Com isso eu libero o botão **Corrigir** só para essa chamada, com:
- lista fechada de rotas de escrita (só renomear; nunca excluir, mover ou criar);
- confirmação sua antes, mostrando "nome atual → nome novo";
- um arquivo por vez, parando na primeira recusa 401/403;
- registro do que foi alterado (nome antigo e novo) para desfazer;
- teste com o Onvio simulado antes de tocar no real.
