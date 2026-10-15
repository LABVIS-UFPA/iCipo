# 🚀 Migração para Vite + Svelte 5 (iCipó)

Todas as interfaces de usuário da extensão foram migradas para componentes **Svelte 5** com compilação e empacotamento via **Vite**:

- **Projetos** (`ui/projects`): Gerenciador e seletor de projetos RSL.
- **Popup** (`ui/popup`): Menu rápido com métricas e atalhos da extensão.
- **Configurações/Opções** (`ui/options`): Backup (import/export JSON) e monitoramento do servidor WebSocket local.
- **Dashboard** (`ui/dashboard`): Painel principal de análise, fases, categorias e triagem de artigos.

---

## 🛠️ Comandos de Build

Os comandos são multiplataforma (compatíveis com Linux, macOS e Windows):

### 1. Build de todas as telas (Recomendado)
```bash
npm run build
# ou
npm run build:ui
```

### 2. Build individual por tela
```bash
npm run build:projects   # Apenas projetos
npm run build:popup      # Apenas popup
npm run build:options    # Apenas configurações
npm run build:dashboard  # Apenas dashboard
```

### 3. Modo Desenvolvimento
```bash
npm run dev:projects
npm run dev:popup
npm run dev:options
npm run dev:dashboard
```

---

## 🧪 Como testar na extensão do Chrome

1. Instalar dependências (caso ainda não o tenha feito):
   ```bash
   npm install
   ```

2. Gerar o build de todas as interfaces:
   ```bash
   npm run build
   ```

3. Carregar no navegador:
   - Acesse: `chrome://extensions`
   - Ative o **Modo do desenvolvedor** (canto superior direito)
   - Clique em **"Carregar sem compactação"**
   - Selecione a pasta raiz do projeto (`iCipo`)

4. Para testar o servidor local com sincronização:
   ```bash
   npm start
   ```

5. Após alterações no código Svelte/JS:
   ```bash
   npm run build
   ```
   E clique no botão de recarregar (⟳) na página de extensões do Chrome.