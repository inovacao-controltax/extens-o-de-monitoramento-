# Hub de Monitoramento do Portal

Extensão Chrome (Manifest V3) para a ControlTax acompanhar o uso do Portal do Cliente.
Plano por fases em `docs/ROADMAP.md`.

## Testar
`chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → escolha esta pasta → clique no ícone da extensão.

**Para atualizar sem perder o que já foi lido:** troque os arquivos **dentro da mesma pasta** e clique em **Recarregar** (↻) no cartão da extensão em `chrome://extensions`; depois recarregue (F5) as abas do Onvio. Remover a extensão ou carregar outra pasta conta como instalação nova: o Chrome apaga o que ela guardou (lista de treinados do Hub, notificações, solicitações, endereços aprendidos) e tudo é lido de novo.

## Visual
Segue o design system do Control Hub (`inovacao-controltax/control-hub`): `hub/tokens.css` é cópia de `tokens.css` de lá, e todo CSS usa só `var(--...)`. Ao mudar o design lá, atualize a cópia aqui.

## Por cima do Onvio
Com o Onvio aberto (https://onvio.com.br, usuário do **escritório**) aparece uma **bolinha vermelha "C"** no canto da página. Clique nela, no ícone da extensão ou use **Alt+Shift+M** para abrir o hub por cima da tela inteira. **Esc** ou **×** fecha; a coleta continua por trás se estiver rodando. A bolinha se arrasta.
Regras: nunca abre sozinha, só abre com clique de verdade (um script da página não consegue abrir), não existe na visão do cliente (`/clientcenter`), não lê a página. Fora do Onvio, o ícone abre o hub numa guia.

## Leitura ao vivo (sem clicar em nada)
Assim que uma página do Onvio (visão do escritório) abre, a extensão começa a ler o portal em segundo plano. Você usa o Onvio normalmente e o painel **cresce ao vivo**:
- **Primeiro dado real em poucos segundos** (depois da 1ª empresa lida); enquanto lê, o painel nunca mostra os números de exemplo.
- **4 empresas ao mesmo tempo** (e as páginas da lista de empresas também em paralelo); as **empresas treinadas são lidas primeiro**.
- **Atualização contínua:** depois da leitura completa, as empresas treinadas são relidas a cada 10 min (poucas chamadas); a leitura completa se repete a cada 6 h.
- O andamento aparece na dica da bolinha ("Lendo o Onvio: 12 de 1056") e no painel; o número no ícone atualiza sozinho.
- Só leitura (GET, lista fechada), com pausa. Só desce nos projetos Pessoal, Fiscal, Contabilidade e Financeiro; os demais entram só pelo nome. Se o Onvio pedir calma (429), espera e segue. Para sozinha com acesso de cliente ou sessão caída (tenta de novo em 30 min). Uma trava impede duas abas lendo ao mesmo tempo.
- Para desligar: Coleta do Onvio › desmarcar "Ler o Onvio sozinho".
- **Quem enviou o arquivo:** o Onvio só informa o identificador do autor. É do escritório quem envia para muitas empresas diferentes (ou o usuário logado); cliente quem aparece em poucas. Heurística; o identificador não é guardado.
- **Não altera nada** no Onvio nem no Control Onvio: só lê, e a bolinha vive num elemento próprio (Shadow DOM). Se ela cobrir algo, arraste-a.

## Ler o Onvio (Fase 4c)
1. Abra https://onvio.com.br numa aba e entre com o usuário do **escritório**.
2. Abra o hub por cima (bolinha) e vá em **Coleta do Onvio** (ou o botão **Coletar do Onvio**), clique em **Testar leitura**. O relatório mostra só nomes de campos e contagens (sem nomes de empresas).
3. Clique em **Coletar agora** (comece com 20 empresas; 0 lê todas). O painel passa a mostrar "Dados do Onvio" e o ícone da extensão mostra o número de pendências.
   Opcional: **Coletar sozinho ao abrir** (desligado de fábrica) coleta ao abrir por cima do Onvio quando os dados têm mais de 6 h.

Regras de segurança: só leitura (GET), lista fechada de rotas (`src/onvio-reader.js`), nada de token ou cookie passa pela extensão, uma empresa por vez com pausa, recusa acesso de cliente. Os dados ficam só no navegador; "Apagar dados coletados" remove tudo.

### A conferir no Onvio real
- Qual campo diz quem enviou o arquivo (hoje há uma heurística; se nada for reconhecido o painel avisa).
- Se os projetos do cliente são mesmo os departamentos (Pessoal, Fiscal...) e se o id da folha serve nos documentos.
- Se a lista de CND traz todas as empresas e o CNPJ.

## Gestta · notificações desativadas (Fase 5)
Com uma aba do **Gestta** aberta e logada, a extensão lê os funcionários sozinha (na abertura e a cada 60 min) e o monitor **Notificações** lista quem tem tarefas ativas mas está com o aviso de tarefa nova desligado.
- **Só leitura** e lista fechada: perfil, lista de funcionários, cadastro de um funcionário e a busca de tarefas (só o total, para contar). 
- **O token do Gestta nunca sai da página** (a leitura roda dentro dela). Do cadastro do funcionário, permissões, tentativas e último login **nunca** são lidos nem guardados; ficam só nome, e-mail interno, setor, quantas tarefas ativas e o sim/não da notificação.
- **Campo da notificação:** o mapeamento do Control Onvio não diz onde o Gestta guarda esse aviso. A extensão procura sozinha campos verdadeiro/falso de notificação no cadastro e só decide se houver um candidato claro; senão avisa e nunca chuta. Em **Coleta do Onvio › Gestta**: **Testar leitura do Gestta** (relatório só com nomes de campos), campo manual e **Aprender chamadas (2 h)**, que registra, enquanto você navega no Gestta, só o método, a rota sem ids e os **nomes** dos campos das chamadas da própria tela (nunca valores, cabeçalhos ou token).
- Para achar o campo: ligue "Aprender chamadas", abra no Gestta Configure › Funcionários › um funcionário › notificações (sem salvar nada) e use "Ver chamadas observadas".
- A bolinha da extensão também aparece no Gestta (canto inferior direito, arrastável) e abre o painel por cima dele. A leitura do Onvio só roda em página do Onvio.
- **Usuário sem departamento:** se o seu usuário no Gestta não tem departamento vinculado, a busca de tarefas pode vir zerada para todos. O diagnóstico e o painel avisam ("Nenhum funcionário aparece com tarefas ativas"); entre com um gestor/administrador ou peça para vincular um departamento.
- Se o Gestta recusar o cadastro de funcionários (403), o painel diz que falta acesso; a extensão não pré-julga o papel da pessoa.

## Notificações do escritório (Onvio)
O liga/desliga de notificação de cada funcionário fica no **Onvio** (Configurações › Notificações dos usuários do escritório): "A cada nova Solicitação de Serviço › via e-mail / via sistema". Detalhes em `docs/onvio-notificacoes.md`.
Para a extensão aprender a ler essa tela: **Coleta do Onvio › Aprender chamadas do Onvio (2 h)**, abra a tela e o lápis de um funcionário (sem salvar), e use **Ver chamadas observadas do Onvio**. O modo aprender registra só método, rota sem ids e **nomes** de campos (nunca valores, token ou cabeçalhos), só roda enquanto ligado e não toca em `fetch`/XHR da página antes disso.

**Testar leitura das notificações** (Coleta do Onvio › Notificações do escritório): lê a equipe ativa e, de uma amostra, a configuração de notificação de cada funcionário (só GET, 2 rotas observadas no portal) e mostra códigos, nomes de campos e contagens sim/não por campo, nunca valores por pessoa. É o passo que descobre o formato da resposta para o monitor.

## Clientes treinados direto do Hub
Veja `docs/hub-ligacao.md`: em Configurações › Puxar do Control Hub, a extensão traz as empresas 100% treinadas e com contato.
