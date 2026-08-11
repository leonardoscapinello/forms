# Forms

Projeto pessoal de **Leonardo Scapinello** para criar, publicar e analisar formulários e quizzes interativos.

## Stack

- React, TypeScript e Vite
- Tailwind CSS e componentes Radix UI
- Supabase (Postgres, Auth e Edge Functions) e MinIO para mídia
- Vitest e Testing Library

## Ambiente local

Requisitos: Node.js 24, npm e Supabase CLI.

```sh
npm install
cp .env.example .env
npm run dev
```

Preencha no `.env` apenas as credenciais públicas do projeto Supabase. Chaves de serviço e senhas de banco nunca devem ser expostas ao frontend.

## Validação

```sh
npm run verify
```

O comando executa typecheck, lint, testes e build de produção.

## Banco e Edge Functions

Com o projeto correto vinculado pela Supabase CLI:

```sh
npx supabase db push --linked
npx supabase functions deploy --project-ref SEU_PROJECT_REF
```

Revise sempre o projeto vinculado antes de aplicar migrações ou publicar funções.

### Primeiro administrador

Uma instalação vazia pode habilitar temporariamente o bootstrap protegido da
primeira conta. Gere um token aleatório fora de logs, cadastre `SETUP_TOKEN` e
`SETUP_ENABLED=true` somente como Edge Secrets e abra o login. A criação só é
aceita quando Auth, `profiles` e `user_roles` confirmam que não existe usuário.
Imediatamente após o primeiro acesso, defina `SETUP_ENABLED=false` e remova ou
rotacione o token. Nunca habilite esse modo em uma instalação já utilizada.

O procedimento operacional completo está em `RUNBOOK-PRODUCAO.md`.

## Deploy na Vercel

A aplicação usa arquitetura híbrida: o painel/editor continua interativo no navegador, enquanto cada rota pública `/f/:id` recebe HTML inicial, SEO e primeira pintura gerados no servidor pela Vercel antes da hidratação do formulário. Importe este repositório na Vercel e configure:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_PUBLIC_APP_URL` com a URL canônica da aplicação
- `VITE_PIXEL_ALLOWED_HOSTS` com os hosts autorizados

O arquivo `vercel.json` contém as rotas server-side do formulário, o fallback do React Router, headers de segurança e políticas de cache. O backend, Auth, banco e Edge Functions permanecem no projeto Supabase vinculado. A decisão e o caminho incremental para SSR estão documentados em `ADR-001-RENDERIZACAO-HIBRIDA-E-SSR.md`.

## Identidade visual

O shell do produto usa FH Duo Display em arquivos WOFF2 locais e uma identidade monocromática preta. Logos e favicons configurados em cada formulário continuam independentes, preservando o recurso white-label.
