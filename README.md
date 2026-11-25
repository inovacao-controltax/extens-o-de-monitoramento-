# Hub de Monitoramento do Portal

Extensão Chrome (Manifest V3) para a ControlTax acompanhar o uso do Portal do Cliente.
Plano por fases em `docs/ROADMAP.md`.

## Testar
`chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → escolha esta pasta → clique no ícone da extensão.

## Visual
Segue o design system do Control Hub (`inovacao-controltax/control-hub`): `hub/tokens.css` é cópia de `tokens.css` de lá, e todo CSS usa só `var(--...)`. Ao mudar o design lá, atualize a cópia aqui.

## Por cima do Onvio
Com o Onvio aberto (https://onvio.com.br, usuário do **escritório**) aparece uma **bolinha vermelha "C"** no canto da página. Clique nela, no ícone da extensão ou use **Alt+Shift+M** para abrir o hub por cima da tela inteira. **Esc** ou **×** fecha; a coleta continua por trás se estiver rodando. A bolinha se arrasta.
Regras: nunca abre sozinha, só abre com clique de verdade (um script da página não consegue abrir), não existe na visão do cliente (`/clientcenter`), não lê a página. Fora do Onvio, o ícone abre o hub numa guia.

## Leitura automática (sem clicar em nada)
Ao abrir qualquer página do Onvio (visão do escritório), cerca de 8 segundos depois a extensão começa a ler o portal sozinha, em segundo plano, e repete a cada 30 min **se os dados têm mais de 6 h**. Você usa o Onvio normalmente. O andamento aparece na dica da bolinha ("Lendo o Onvio: 12 de 1056") e no hub; o painel e o número no ícone atualizam sozinhos quando termina.
- Só leitura (GET), uma empresa por vez, com pausa. Só desce nos projetos Pessoal, Fiscal, Contabilidade e Financeiro; os demais (Administrativo, Patrimônio, Registro de Empresas...) entram só pelo nome.
- Para sozinha com acesso de cliente, se a sessão cair ou se o Onvio pedir calma (volta a tentar em 30 min). Uma trava impede duas abas lendo ao mesmo tempo.
- Para desligar: Coleta do Onvio › desmarcar "Ler o Onvio sozinho".
- **Quem enviou o arquivo:** o Onvio só informa o identificador do autor. A extensão considera do escritório quem envia para muitas empresas diferentes (ou o usuário logado) e cliente quem aparece em poucas. É uma heurística; o identificador não é guardado.
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
