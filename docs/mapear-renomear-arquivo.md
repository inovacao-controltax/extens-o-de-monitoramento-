# Renomear um arquivo no Onvio — MAPEADO (26/11/2026)

Chamada observada pelo modo aprender ao renomear um arquivo pelo próprio Onvio:

| Método e rota | Corpo (só nomes dos campos) | Resposta |
|---|---|---|
| `PUT storage/v1/folders/{pasta}/documents/{arquivo}` | `name`, `id`, `containerId` | 200 com o documento |
| `GET storage/v1/folders/{pasta}/documents/{arquivo}/metadata?LoadItemMetadata` | — | `data.name`, `data.containerId` (usada para conferir antes) |

Só foi mapeada para arquivo em **pasta** (`storage/v1/folders/...`). Arquivo na raiz do projeto fica de fora (a rota de projeto não foi vista). Renomear **pasta** ainda não foi mapeado.

---

# Como mapear uma chamada nova (roteiro)

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
