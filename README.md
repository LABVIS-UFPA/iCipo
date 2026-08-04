# Marcalink Snowballing
Plugin para Chrome que auxilia a marcação e organização de links durante o processo de snowballing em pesquisas acadêmicas.

---

## Status atual (28/02/2026)
- **Frontend**: interfaces principais implementadas (`ui/options/options.html`, `ui/projects/projects.html`, `ui/dashboard/dashboard.html`) com scripts de interação (`ui/*/*.js`).
- **Extensão**: `background.js` e `content.js` presentes e tratam mensagens entre UI e background.
- **Core**: lógica e modelos em [core/entities.mjs](core/entities.mjs) e [core/utils.mjs](core/utils.mjs).
- **Infraestrutura**: persistência e comunicação em [infrastructure/storage.mjs](infrastructure/storage.mjs) e [infrastructure/socketManager.mjs](infrastructure/socketManager.mjs).
- **Servidor auxiliar**: [server.mjs](server.mjs) disponível para integrações opcionais.
- **Observação**: muitas rotas de mensagem (contrato `projects.*`) estão definidas no frontend; alguns handlers ainda funcionam como stubs e aguardam integração completa com o storage/backend.

---

## Funcionalidades implementadas
- UI para gerenciar projetos (criar, renomear, remover, definir projeto atual) — lógica frontend implementada em `ui/projects/projects.js`.
- Popup e página de opções com navegação para Dashboard e Projetos.
- Contrato de mensagens básico entre frontend e background (ex.: `projects.list`, `projects.create`, `projects.rename`, `projects.remove`, `projects.setCurrent`).

---

## Como executar e testar localmente
1. Instale dependências e rode o servidor (opcional):
```bash
npm install
node server.mjs
```
2. Carregue a extensão no Chrome/Edge:
  - Acesse `chrome://extensions`, ative "Modo do desenvolvedor" e clique em "Carregar sem compactação";
  - Selecione a pasta do repositório.
3. Testes rápidos:
  - Abra o popup da extensão e navegue para "Meus projetos";
  - Abra `ui/projects/projects.html` e realize operações (criar/renomear/remover/definir atual) observando o console da extensão;
  - Verifique mensagens entre UI e `background.js` no DevTools da extensão.

---

## Arquivos-chave
- [background.js](background.js)
- [content.js](content.js)
- [server.mjs](server.mjs)
- [core/entities.mjs](core/entities.mjs)
- [core/utils.mjs](core/utils.mjs)
- [infrastructure/storage.mjs](infrastructure/storage.mjs)
- [infrastructure/socketManager.mjs](infrastructure/socketManager.mjs)
- UI: [ui/projects/projects.html](ui/projects/projects.html), [ui/projects/projects.js](ui/projects/projects.js), [ui/options/options.html](ui/options/options.html), [ui/dashboard/dashboard.html](ui/dashboard/dashboard.html)

---

## Próximos passos recomendados
- Implementar os handlers de persistência em [infrastructure/storage.mjs](infrastructure/storage.mjs) para as ações `projects.*`.
- Sincronizar o estado entre abas/popup usando listeners de storage ou mensagens.
- Melhorar testes (unitários e E2E) para o fluxo de projetos.
- Documentar contrato de mensagens e APIs internas.

---

## Contribuição
- Abra issues com descrição clara de bugs ou melhorias.
- Envie PRs com escopo pequeno, descrição e testes quando aplicável.

---

## Licença
Veja o arquivo [LICENSE](LICENSE).


- Ao clicar no ícone da extensão, o dashboard é aberto diretamente em uma nova aba.
