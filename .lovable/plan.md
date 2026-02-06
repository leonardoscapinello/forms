

# 🧩 FormFlow Builder - Sistema de Criação de Formulários & Quizzes

## Visão Geral
Um builder de formulários estilo Typeform com um editor visual de nodes completo, backend com persistência de dados, coleta de respostas e dashboard de resultados. Interface minimalista e limpa.

---

## Fase 1 — Builder de Formulários (Core)

### Painel de Controle (Dashboard)
- Lista de formulários criados com status (rascunho, publicado, arquivado)
- Métricas rápidas: total de respostas, taxa de conclusão
- Botão de criar novo formulário

### Editor de Formulários (Canvas)
- Adicionar/remover/reordenar perguntas via drag & drop
- Tipos de perguntas suportados: texto curto, texto longo, múltipla escolha, seleção única, escala/rating, email, número, data
- Preview em tempo real da pergunta sendo editada
- Configuração por pergunta: obrigatória, placeholder, descrição auxiliar
- Personalização visual: cores, logo, imagem de fundo

### Visualização Estilo Typeform
- Uma pergunta por tela com transições suaves
- Barra de progresso
- Tela de boas-vindas e tela de agradecimento personalizáveis
- Responsivo para mobile

---

## Fase 2 — Node Editor Visual

### Canvas de Nodes
- Editor visual estilo n8n/Make com zoom, pan e grid
- Cada pergunta representada como um node no canvas
- Conexões visuais entre nodes (arrastar linhas entre eles)
- Nodes de condição: direcionar o fluxo baseado em respostas (ex: "Se resposta = A, ir para pergunta X")
- Nodes de ação: enviar webhook, redirecionar URL, mostrar resultado específico
- Mini-mapa para navegação no canvas

### Lógica Condicional
- Ramificações baseadas em respostas anteriores
- Pular perguntas com base em regras
- Múltiplos caminhos/finais possíveis

---

## Fase 3 — Backend & Coleta de Dados

### Autenticação
- Login/cadastro para criadores de formulários
- Formulários públicos acessíveis sem login (para respondentes)

### Banco de Dados
- Armazenamento de formulários (estrutura, configurações, estilo)
- Armazenamento de respostas vinculadas a cada formulário
- Perfis de usuário

### Dashboard de Respostas
- Visualização de todas as respostas por formulário
- Gráficos de distribuição para perguntas de múltipla escolha
- Exportação de dados (CSV)
- Filtros por data e status de conclusão

---

## Fase 4 — Compartilhamento & Integrações

### Publicação
- Link público único para cada formulário
- Embed via iframe
- QR Code para compartilhamento

### Integrações (via nodes)
- Node de webhook para enviar dados a qualquer URL
- Preparação para integração com Zapier/n8n

---

## Stack Técnica
- **Frontend**: React + TypeScript + Tailwind (minimalista, fundo branco, tipografia clean)
- **Backend**: Lovable Cloud (Supabase) para banco de dados, autenticação e edge functions
- **Bibliotecas**: React Flow para o node editor, dnd-kit para drag & drop, Recharts para gráficos no dashboard

