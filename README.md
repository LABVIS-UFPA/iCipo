# 🌿 iCipó — Assistente de Snowballing e Revisão Sistemática da Literatura (RSL)

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Frontend: Svelte 5](https://img.shields.io/badge/Frontend-Svelte%205-orange.svg)](https://svelte.dev/)
[![Bundler: Vite 6](https://img.shields.io/badge/Bundler-Vite%206-purple.svg)](https://vitejs.dev/)
[![Chrome Extension: Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org/)

O **iCipó** é uma extensão avançada para o Google Chrome desenvolvida pelo **LABVIS-UFPA** (Laboratório de Visualização e Processamento de Imagens da Universidade Federal do Pará). Sua finalidade é apoiar pesquisadores durante a condução de **Revisões Sistemáticas da Literatura (RSL)** e procedimentos rigorosos de **Snowballing** (*backward* e *forward*, em conformidade com as diretrizes metodológicas de Wohlin).

Com o iCipó, todo o ciclo de busca, triagem, categorização semântica e rastreamento de linhagem de artigos acadêmicos é integrado diretamente ao fluxo de navegação no **Google Scholar**, eliminando o atrito de alternar entre planilhas e páginas web e prevenindo a perda de contexto ou leituras duplicadas.

---

## 📌 Status Atual do Projeto

O projeto completou com êxito a modernização total da sua base de código na branch `94-mirgração-do-projeto-para-sveltvite`:

- **Migração Integral para Svelte 5 + Vite 6:** Todas as 4 interfaces de usuário (`Dashboard`, `Meus Projetos`, `Configurações` e `Popup`) foram reescritas e componentizadas em **Svelte 5** com compilação ultra-rápida via **Vite 6**.
- **Decomissão Completa do Monolito Legado:** O antigo arquivo monolítico `ui/dashboard/src/dashboardLogic.js` (~4.700 linhas) foi totalmente eliminado e decomissionado. A lógica da aplicação agora opera em componentes especializados, com estado reativo gerenciado centralmente por `dashboardStore.js` e utilitários puros de domínio em `dashboardHelpers.js`.
- **Limpeza Profunda de Código Morto:** Foram removidas pontes legadas temporárias (`viewBridge`, `filterBridge`, `registerLegacyBridge`), imports órfãos, variáveis não utilizadas e manipuladores redundantes, resultando em um build limpo com **0 erros e 0 warnings**.
- **Manifest V3 Nativo:** O Service Worker (`background.js`) opera em ES Modules nativos com persistência resiliente, alarmes assíncronos e menus de contexto dinamicamente vinculados à fase ativa da pesquisa.
- **Persistência Híbrida e Local-First:** Suporte a armazenamento em cache no navegador via `chrome.storage.local` e sincronização bidirecional em tempo real via WebSocket com o servidor local Node.js (`server.mjs`), que salva os dados em arquivos JSON em `user_data/`.

---

## 🏛️ Arquitetura do Sistema

O iCipó é organizado em quatro camadas bem delimitadas, garantindo desacoplamento, reatividade e facilidade de manutenção:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Google Scholar (Web)                            │
│  [ Links de Artigos ] ──► [ Destaque Visual ] ──► [ Extração Metadados ]│
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Content Script (content.js)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Chrome Extension (Manifest V3)                       │
│  Service Worker (background.js) ◄──► Context Menus & Chrome Storage    │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
                   │ WebSocket (ws://localhost:8080)  │ Storage API Fachada
                   ▼                                  ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       Servidor Local (server.mjs)    │  │   Interfaces (Svelte 5)      │
│  • Persistência em user_data/*.json  │  │  • ui/dashboard (Painel)    │
│  • Sincronização multi-janela        │  │  • ui/projects (Projetos)   │
│  • Backup e integridade de disco     │  │  • ui/options (Configurações)│
└──────────────────────────────────────┘  │  • ui/popup (Menu Rápido)    │
                                          └──────────────────────────────┘
```

### 1. Camada de Apresentação (`ui/`)
- **`ui/dashboard/`**: Centro de comando analítico e operacional da RSL. Organizado em visões modulares:
  - `OverviewView.svelte`: KPIs analíticos, gráfico Donut de categorias, progresso de fases e artigos recentes com navegação contextual direta.
  - `PhasesView.svelte`: Esteira contínua de fases com setas de progressão, reordenação Drag & Drop, conclusão de etapas e painel integrado de artigos (`PhaseArchivePanel.svelte` / "Ver artigos"): reúne todas as funcionalidades de triagem em lote (*Bulk Actions*), atribuição de desfechos com modal de categorias, desmarcação, modo Snowballing ativo, linha do tempo genealógica de auditoria, busca sintática (`id:`, `parent:`), edição inline de Ano/Tags e alternância entre visualização em Cartões e Tabela analítica.
  - `CategoriesView.svelte`: Gestão de categorias semânticas, critérios de inclusão/exclusão e seletor de cores com contraste WCAG dinâmico.
- **`ui/projects/`**: Painel de gerenciamento de estudos RSL. Permite criar novos projetos com geração automática de identificador canônico (*slug*), alternar entre projetos ativos, editar metadados e arquivar pesquisas concluídas.
- **`ui/options/`**: Página de opções com chave geral da extensão, importação/exportação de backups integrais em JSON e console com monitoramento de status e mensagens do servidor WebSocket em tempo real.
- **`ui/popup/`**: Menu de acesso rápido na barra de extensões, exibindo o projeto ativo, fase corrente, contadores rápidos (Total, Incluídos, Excluídos, Pendentes) e botões de atalho.

### 2. Camada de Extensão Chrome (`background.js` & `content.js`)
- **`background.js` (Service Worker MV3):**
  - Monitora o estado do projeto e da fase ativa para reconstruir dinamicamente os menus de contexto do Chrome com as categorias vigentes.
  - Recebe comandos de marcação e vincula automaticamente o `parentId` quando uma sessão de snowballing estiver em execução.
  - Mantém a sincronização de mensagens entre abas abertas e o socket local.
- **`content.js` (Content Script):**
  - Injetado nas páginas de busca do Google Scholar.
  - Aplica destaque visual e cores personalizadas nos links previamente classificados.
  - Extrai metadados estruturados (título, autores, ano de publicação e links) na marcação.

### 3. Camada de Domínio (`core/`)
- **`core/entities.mjs`:** Classes orientadas a objetos com validação pura de esquemas:
  - `Project`: Entidade raiz com fases, categorias, critérios e lista consolidada de artigos.
  - `Paper`: Representa o artigo analisado, armazenando metadados, categoria, desfecho métrico, histórico de transições de fase e parentesco genealógico (`parentId`).
  - `Phase`: Etapa metodológica do estudo (ex.: Título/Resumo, Leitura Completa, Snowballing) com status de conclusão e proteção contra exclusão pós-conclusão.
  - `Category`: Categorização semântica ligada a um impacto métrico normalizado (`included`, `excluded` ou `pending`).
  - `Criterion`: Critérios formais de inclusão e exclusão associados às categorias.
- **`core/utils.mjs`:** Funções utilitárias puras de geração de slug, normalização de métricas, hashing e manipulação de arrays sem efeitos colaterais.

### 4. Camada de Infraestrutura e Persistência (`infrastructure/` & `server.mjs`)
- **`infrastructure/storage.mjs`:** Fachada unificada que abstrai o armazenamento híbrido, consultando e gravando concorrentemente no `chrome.storage.local` e no WebSocket local.
- **`infrastructure/socketManager.mjs`:** Gerenciador do cliente WebSocket com fila de requisições, detecção de queda e reconexão automática contínua.
- **`server.mjs`:** Servidor local independente em Node.js (`ws://localhost:8080`) responsável por garantir a persistência em disco na pasta `user_data/`, possibilitando controle de versão externo e segurança contra perdas de cache do navegador.

---

## ⚡ Funcionalidades em Destaque

### 🔄 1. Fluxo de Snowballing Assistido em Tempo Real
- **Ativação por Artigo:** Na tabela de artigos do Dashboard, clique no botão **"Iniciar Snowballing"** de qualquer artigo incluído para definir a raiz da busca.
- **Indicador Persistente:** Um banner verde pulsante no topo da tabela e no storage indica qual artigo pai está em processo ativo de snowballing, com botão de parada a qualquer momento.
- **Coleta no Google Scholar:** Ao navegar pelas seções "Citado por" (*forward*) ou nas referências (*backward*) no Google Scholar e marcar novos links, o iCipó vincula automaticamente o novo artigo ao `parentId` correspondente.
- **Navegação Genealógica:** No modal de histórico do artigo (`PaperHistoryModal`), é possível visualizar a linha do tempo completa e clicar em **"Ver artigo pai"** ou **"Ver artigos filhos (N)"** para navegar na árvore de citações.
- **Busca por Sintaxe:** A barra de busca suporta consultas diretas por parentesco ou identificador:
  - `parent:<id_do_artigo>`: filtra instantaneamente todos os artigos derivados daquele nó de snowballing.
  - `id:<id_do_artigo>`: localiza diretamente o registro pelo hash identificador.

### 📋 2. Gestão de Fases e Proteção de Rastreabilidade
- **Progressão Sequencial:** Organize a revisão em fases formais (ex.: *Fase 1: Título e Resumo*, *Fase 2: Texto Completo*, *Fase 3: Snowballing*).
- **Drag & Drop:** Reordene livremente fases futuras ainda não iniciadas arrastando os cartões de fase.
- **Trava de Segurança:** Uma vez concluída uma fase, ela é bloqueada contra exclusão para garantir a reprodutibilidade científica da pesquisa.
- **Painel de Arquivo de Fases:** Expanda o histórico de fases encerradas para auditar quais artigos foram processados e qual foi o desfecho de cada um naquela etapa.

### 🏷️ 3. Categorização Semântica (Categorias Padrão & Personalizadas)
- **Categorias Padrão:** O iCipó já vem configurado com **Incluir**, **Excluir** e **Pendente** como categorias padrão essenciais da revisão.
- **Categorias Personalizadas com Impacto Métrico:** O pesquisador pode criar categorias personalizadas adicionais para justificar motivos específicos (ex.: *Excluir - Fora do Escopo*, *Incluir - Estudo Primário*), escolhendo explicitamente a qual métrica cada uma se relaciona: **Incluir**, **Excluir** ou **Pendente**.
- **Cálculo Automático de Contraste (WCAG):** Ao selecionar uma cor para a categoria, o sistema calcula dinamicamente o contraste do texto para máxima legibilidade.
- **Sincronização com o Navegador:** Apenas as categorias vinculadas à fase ativa aparecem no menu de contexto do clique direito no Google Scholar.

### ⚡ 4. Triagem Integrada nas Fases ("Ver artigos")
- **Gaveta de Artigos por Fase:** Acesso direto a todos os artigos vinculados à fase ativa através do botão "Ver artigos" no cartão da fase.
- **Alternância de Visualização (Cartões vs. Tabela):** Suporte a modo Cartões (com autores, ano e notas) ou modo Tabela (linhas densas para análise rápida), com preferência persistida automaticamente.
- **Triagem Direta com Botões de Ação:** Classificação imediata com botões **✓ Incluir**, **× Excluir** e **⏳ Pendente** diretamente no artigo.
- **Seleção Inteligente de Categoria (*PaperBulkCategoryModal*):** Se houver mais de uma categoria cadastrada para o mesmo desfecho, o sistema apresenta um seletor rápido para o pesquisador escolher qual motivo específico aplicar.
- **Desmarcar Artigos:** Opção de desmarcar um artigo para retirá-lo da fase ativa sem marcá-lo como reprovado na pesquisa.

### 🎓 5. Tutorial Interativo Integrado (Onboarding em 4 Etapas)
- O Dashboard conta com um guia passo a passo completo e acessível a qualquer momento pelo botão **📖 Tutorial**:
  1. **Etapa 1:** Introdução geral ao Dashboard, Fases, Categorias e Visão Geral.
  2. **Etapa 2:** Criação da Primeira Fase com vinculação automática das categorias padrão.
  3. **Etapa 3:** Gestão de Categorias Padrão e criação de Categorias Personalizadas vinculadas às métricas.
  4. **Etapa 4:** Como funciona a triagem de artigos na fase (Google Scholar, gaveta de artigos, modo Cartões/Tabela, botões diretos e filtros).

---

## 🛠️ Instalação e Execução

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18.x ou superior.
- Navegador Google Chrome ou qualquer navegador baseado em Chromium (Edge, Brave, Opera, Vivaldi).

### 1. Clonar o Repositório e Instalar Dependências
```bash
git clone https://github.com/LABVIS-UFPA/iCipo.git
cd iCipo
npm install
```

### 2. Compilar as Interfaces com Vite
Para compilar todas as 4 interfaces de usuário de uma só vez:
```bash
npm run build
```
> Os arquivos empacotados serão gerados em `ui/projects/dist/`, `ui/dashboard/dist/`, `ui/options/dist/` e `ui/popup/dist/`.

Para compilar alvos individuais sob demanda:
```bash
npm run build:dashboard   # Compila somente o Dashboard
npm run build:projects    # Compila somente a tela de Meus Projetos
npm run build:options     # Compila somente a tela de Configurações
npm run build:popup       # Compila somente o Menu Popup
```

### 3. Iniciar o Servidor Local de Persistência (Recomendado)
Para persistir os dados dos projetos localmente em arquivos JSON dentro da pasta `user_data/`:
```bash
npm start
```
*O servidor WebSocket será iniciado em `ws://localhost:8080`.*

### 4. Modo de Desenvolvimento com Live Reload
Durante o desenvolvimento das interfaces Svelte:
```bash
npm run dev:dashboard     # Watch mode do Dashboard
npm run dev:projects      # Watch mode de Meus Projetos
npm run dev:options       # Watch mode de Configurações
npm run dev:popup         # Watch mode do Popup
```

---

## 🚀 Como Carregar a Extensão no Google Chrome

1. Abra o Google Chrome e digite na barra de endereços: `chrome://extensions/`
2. No canto superior direito da página, ative o botão de alternância **Modo do desenvolvedor** (*Developer mode*).
3. No canto superior esquerdo, clique no botão **Carregar sem compactação** (*Load unpacked*).
4. Navegue até a pasta onde o repositório foi clonado e selecione a pasta raiz **`iCipo`**.
5. Pronto! O ícone do **iCipó** estará disponível na barra de extensões do navegador.
   - Clique no ícone da extensão para abrir o popup e acessar o Dashboard ou Meus Projetos.
   - Sempre que alterar código frontend e rodar `npm run build`, clique no ícone de **Recarregar (⟳)** no cartão do iCipó em `chrome://extensions/`.

---

## 📂 Estrutura de Diretórios do Projeto

```
iCipo/
├── manifest.json              # Manifesto da extensão Chrome (Manifest V3)
├── background.js              # Service Worker (menus de contexto, storage e alarmes)
├── content.js                 # Content Script injetado no Google Scholar
├── server.mjs                 # Servidor WebSocket local para persistência em user_data/
├── build.mjs                  # Script de automação do build multi-alvo (Node + Vite)
├── vite.config.mjs            # Configuração do Vite e plugin Svelte 5
├── package.json               # Dependências, metadados e scripts NPM
├── tokens.css                 # Design tokens globais (cores, sombras, tipografia)
│
├── core/                      # Camada de Domínio e Regras de Negócio Puras
│   ├── entities.mjs           # Entidades: Project, Paper, Phase, Category, Criterion
│   └── utils.mjs              # Utilitários de métricas, hashing e slugs
│
├── infrastructure/            # Camada de Persistência e Rede
│   ├── socketManager.mjs      # Cliente WebSocket com fila e reconexão automática
│   └── storage.mjs            # Fachada híbrida (WebSocket + chrome.storage)
│
├── ui/                        # Aplicações Frontend em Svelte 5
│   ├── dashboard/             # Painel Analítico Principal
│   │   ├── dashboard.html     # Ponto de entrada HTML do Dashboard
│   │   ├── dashboard.css      # Estilização global e layout do painel
│   │   ├── dist/              # Bundle compilado pelo Vite (gerado no build)
│   │   └── src/
│   │       ├── main.js        # Bootstrap do componente App.svelte
│   │       ├── App.svelte     # Orquestrador central e navegação por abas
│   │       ├── dashboardStore.js    # Stores reativas e dispatchers assíncronos
│   │       ├── dashboardHelpers.js  # Utilitários puros de métricas, filtros e unificação
│   │       ├── views/         # Visões principais:
│   │       │   ├── OverviewView.svelte    # KPIs, gráficos e artigos recentes
│   │       │   ├── PhasesView.svelte      # Linha do tempo, esteira e gestão de fases
│   │       │   └── CategoriesView.svelte  # Gestão de categorias e critérios
│   │       └── components/    # Componentes reutilizáveis:
│   │           ├── Sidebar.svelte
│   │           ├── Topbar.svelte
│   │           ├── PhaseCard.svelte
│   │           ├── PhasePanel.svelte
│   │           ├── PhaseArchivePanel.svelte # Espaço unificado de triagem e visualização ("Ver artigos")
│   │           ├── CategoryItem.svelte
│   │           ├── CategoryPanel.svelte
│   │           ├── PaperHistoryModal.svelte
│   │           ├── PaperBulkCategoryModal.svelte
│   │           ├── IntroModal.svelte
│   │           └── ArticleTutorialPanel.svelte
│   │
│   ├── projects/              # Gerenciador de Projetos de Pesquisa
│   │   ├── projects.html
│   │   ├── dist/
│   │   └── src/ (App.svelte, main.js)
│   │
│   ├── options/               # Configurações, Backup JSON e Logs do Socket
│   │   ├── options.html
│   │   ├── options.css
│   │   ├── dist/
│   │   └── src/ (App.svelte, main.js)
│   │
│   └── popup/                 # Menu de Acesso Rápido na Barra de Ferramentas
│       ├── popup.html
│       ├── dist/
│       └── src/ (App.svelte, main.js)
│
├── user_data/                 # Diretório onde o server.mjs persiste os arquivos JSON
└── img/                       # Logotipos, ícones e favicons em diferentes resoluções
```

---

## 📖 Fluxo de Trabalho Metodológico com o iCipó

Uma Revisão Sistemática típica conduzida com o auxílio do iCipó segue o seguinte fluxo:

1. **Criação do Projeto:** Acesse a tela de **Meus Projetos** (`ui/projects`), cadastre um novo estudo com objetivo, pesquisadores e escopo, definindo-o como projeto ativo.
2. **Definição Metodológica:** No **Dashboard**, cadastre as fases sequenciais do estudo (ex.: *1. Triagem de Título/Resumo*, *2. Leitura Completa*, *3. Snowballing*) e as categorias semânticas com seus respectivos impactos (*Incluído*, *Excluído*, *Pendente*).
3. **Busca e Marcação no Google Scholar:** Execute suas consultas no Google Scholar. Clique com o botão direito nos artigos de interesse para atribuir uma das categorias da fase ativa. Os metadados serão extraídos e o link receberá destaque colorido imediatamente.
4. **Triagem no Dashboard:** No painel de **Artigos**, utilize a busca textual ou os filtros por fase/situação. Faça edições inline de ano e tags, ou realize inclusões e exclusões em lote com as *Bulk Actions*.
5. **Condução de Snowballing:** Para artigos incluídos que necessitem de expansão, clique em **"Iniciar Snowballing"**. Vá ao Google Scholar, explore as citações ou referências e marque os novos artigos. A linhagem pai-filho será associada automaticamente.
6. **Conclusão de Fase e Rastreabilidade:** Conclua a fase atual no painel de **Fases**. Os artigos processados serão arquivados com seus desfechos registrados, travando o histórico daquela etapa para garantir integridade científica.
7. **Exportação de Dados:** Na aba de **Configurações**, gere o arquivo de backup consolidado `storage_backup.json` contendo todos os projetos, fases, categorias e histórico completo de artigos e citações para análise quantitativa externa (ex.: R, Python, Excel, VOSviewer).

---

## 🤝 Contribuição

Contribuições, relatos de bugs e sugestões de melhorias são amplamente encorajados!

1. Faça um fork do projeto ou crie uma nova branch a partir da principal:
   ```bash
   git checkout -b feature/sua-melhoria
   ```
2. Desenvolva suas alterações respeitando a arquitetura Svelte 5 e valide a compilação:
   ```bash
   npm run build
   ```
3. Garanta que não existam erros de compilação ou regressões.
4. Abra um Pull Request detalhado descrevendo a motivação e as alterações realizadas.

---

## 📄 Licença

Este projeto é distribuído sob os termos da licença **ISC**. Consulte o arquivo [LICENSE](LICENSE) para obter todos os detalhes.
