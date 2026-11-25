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
