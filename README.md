# Forms

Plataforma para criar, publicar e analisar formulários e quizzes interativos.

## Stack

- React, TypeScript e Vite
- Tailwind CSS e componentes Radix UI
- Supabase (Postgres, Auth, Storage e Edge Functions)
- Vitest e Testing Library

## Ambiente local

Requisitos: Node.js 22+, npm e Supabase CLI.

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

## Identidade visual

O shell do produto usa FH Duo Display em arquivos WOFF2 locais e uma identidade monocromática preta. Logos e favicons configurados em cada formulário continuam independentes, preservando o recurso white-label.
