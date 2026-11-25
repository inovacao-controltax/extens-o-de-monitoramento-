# Hub de Monitoramento do Portal

Extensão Chrome (Manifest V3) para a ControlTax acompanhar o uso do Portal do Cliente.
Plano por fases em `docs/ROADMAP.md`.

## Testar
`chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → escolha esta pasta → clique no ícone da extensão.

## Visual
Segue o design system do Control Hub (`inovacao-controltax/control-hub`): `hub/tokens.css` é cópia de `tokens.css` de lá, e todo CSS usa só `var(--...)`. Ao mudar o design lá, atualize a cópia aqui.

## Ler o Onvio (Fase 4c)
1. Abra https://onvio.com.br numa aba e entre com o usuário do **escritório**.
2. No hub, abra **Coleta do Onvio** e clique em **Testar leitura**. O relatório mostra só nomes de campos e contagens (sem nomes de empresas).
3. Clique em **Coletar agora** (comece com 20 empresas; 0 lê todas). O painel passa a mostrar "Dados do Onvio".

Regras de segurança: só leitura (GET), lista fechada de rotas (`src/onvio-reader.js`), nada de token ou cookie passa pela extensão, uma empresa por vez com pausa, recusa acesso de cliente. Os dados ficam só no navegador; "Apagar dados coletados" remove tudo.

### A conferir no Onvio real
- Qual campo diz quem enviou o arquivo (hoje há uma heurística; se nada for reconhecido o painel avisa).
- Se os projetos do cliente são mesmo os departamentos (Pessoal, Fiscal...) e se o id da folha serve nos documentos.
- Se a lista de CND traz todas as empresas e o CNPJ.
