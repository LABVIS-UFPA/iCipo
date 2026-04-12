## 🧪 Como testar (branch: 48-migrar-projects-para-o-svelte)

### Passos

1. Instalar dependências:

npm install

2. Gerar build da tela de projetos:

npm run build:ui

3. Abrir o Chrome:
- Acessar: chrome://extensions
- Ativar modo desenvolvedor
- Clicar em "Carregar sem compactação"
- Selecionar a pasta do projeto

4. Após alterações no código:
- Rodar novamente:

npm run build:ui

- Clicar em "Recarregar" na extensão

5. Acessar a tela de projetos pela extensão

---

## 🔥 Observação

⚠️ Esta branch contém a migração da tela de projects para Svelte + Vite.
