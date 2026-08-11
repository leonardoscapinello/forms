# Relatório de performance e estabilidade de release

Data da baseline: 10 de agosto de 2026
Atualização de produção: 11 de agosto de 2026
Escopo: build Vite, caminhos críticos público e administrativo, divisão de código, cache/service worker, recuperação de chunks e gate de CI.

## Resultado executivo

O build possui orçamento reproduzível por rota, manifesto auditável e bloqueio automático no CI. A rota pública não pode voltar a carregar `AdminApp`, autenticação ou o SDK Supabase sem reprovar o gate. Login, recuperação de senha, dashboard, analytics, galeria, configurações, layout e editor são chunks independentes. A arquitetura híbrida e a rodada final abaixo estão publicadas na Vercel no deployment `dpl_7qFpqdmgsYvL8RL9Edem6qxGmo4Y`.

As medições abaixo são feitas sobre os arquivos realmente emitidos por `vite build`, com gzip nível 9 e Brotli qualidade 11. Elas são budgets de transferência, não substituem LCP/INP/CLS medidos no domínio publicado.

## Orçamentos atuais

| Caminho | Gzip medido | Brotli medido | Arquivos | Limite gzip | Estado |
|---|---:|---:|---:|---:|---|
| Bootstrap compartilhado | 161,4 KiB | 139,3 KiB | 6 | 180 KiB | aprovado |
| Formulário público interativo | 278,3 KiB | 243,0 KiB | 27 | 305 KiB | aprovado |
| Shell administrativo | 258,3 KiB | 223,2 KiB | 17 | 285 KiB | aprovado |
| Login | 262,9 KiB | 227,2 KiB | 23 | 295 KiB | aprovado |
| Recuperação de senha | 262,0 KiB | 226,3 KiB | 22 | 295 KiB | aprovado |
| Lista de formulários | 295,0 KiB | 256,3 KiB | 34 | 335 KiB | aprovado |
| Dashboard geral | 439,8 KiB | 379,6 KiB | 37 | 500 KiB | aprovado |
| Editor de páginas | 567,7 KiB | 491,7 KiB | 73 | 650 KiB | aprovado |

Limites globais adicionais: nenhum chunk JavaScript pode superar 120 KiB gzip e nenhum CSS pode superar 25 KiB gzip. O relatório detalhado de cada build é gravado em `dist/bundle-budget-report.json`.

No snapshot validado, o maior JavaScript é `vendor-react` com 108,32 KiB gzip e o maior CSS é o stylesheet global com 19,82 KiB gzip; ambos permanecem abaixo do gate.

## Antes e depois

| Alteração mensurável | Antes | Depois | Variação |
|---|---:|---:|---:|
| Bootstrap gzip após retirar Framer Motion do chunk manual/eager | 185,1 KiB | 158,7 KiB | −14,3% |
| Shell administrativo gzip após a mesma correção | 280,7 KiB | 253,2 KiB | −9,8% |
| Shell admin com todas as páginas estáticas, modelado pela união do mesmo grafo | 482,5 KiB / 55 arquivos | 253,2 KiB / 17 arquivos | −47,5% gzip |

O valor “antes” do shell estático é calculado pela união das dependências de Dashboard, Analytics, Settings, Gallery, Login, NotFound e AppLayout no mesmo manifesto final. Isso evita comparar builds com funcionalidades diferentes e representa o que o navegador teria de baixar se essas páginas continuassem como imports estáticos.

No caminho público, o contexto mínimo do formulário foi extraído do store administrativo. O gate passa a reprovar se a closure pública contiver `AdminApp`, `useAuth` ou `vendor-supabase`. Essa separação é tratada como invariante arquitetural, não como otimização opcional.

## Estabilidade implementada

- Recuperação instalada antes do primeiro render para `vite:preloadError` e falhas de import dinâmico.
- No máximo uma recarga automática por versão de entry e rota na mesma sessão; falha persistente cai no ErrorBoundary, sem loop.
- Limpeza limitada aos caches da própria aplicação e atualização do service worker antes da recarga.
- Mensagem de erro genérica em produção; detalhes permanecem somente no console/desenvolvimento.
- Remoção do bloqueio de clique direito/F12/atalhos: não oferecia segurança real, adicionava listeners globais e prejudicava acessibilidade, suporte e depuração de incidentes.
- SSR first-paint permanece visível durante Suspense e só é removido em erro terminal para liberar o botão de recuperação.
- Service worker restrito ao escopo `/f/`; preview e painel não podem ser controlados por ele.
- Migração automática de registros antigos com escopo raiz e limpeza apenas de caches legados do Forms.
- Navegação pública network-first com timeout de 3,5 s e fallback cacheado; código sem hash nunca é persistido.
- Assets versionados aceitam cache imutável; imagens públicas sem hash usam revalidação para que logo/favicon não fiquem presos por um ano; requisições de API e Supabase nunca passam pelo service worker.

## Gate de CI

`npm run verify` executa typecheck, lint, testes, build e `npm run check:bundle`. O job do GitHub Actions usa o Node 24 definido em `.nvmrc` e instalação reproduzível por `npm ci`; qualquer regressão de bytes, número de arquivos, chunk individual ou isolamento público encerra o job com erro.

## Evidências automatizadas desta frente

- 11 testes focalizados aprovados: detecção/recuperação de chunk/CSS preload, trava contra loop, origem opaca do preview, escopo do worker, mensagem de erro sem vazamento e acesso direto à recuperação de senha sem redirecionamento indevido.
- Build Vite aprovado com manifesto.
- Orçamento de todas as rotas acima aprovado.
- `node --check public/sw.js` aprovado.

## Evidências no domínio publicado

- `/f/:id` entrega HTML server-side com conteúdo inicial, metadados sociais e thumbnail PNG 1200×630 antes do JavaScript.
- O HTTP real apresentou CSP, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy e proteção de frame.
- Um E2E publicado percorreu lógica condicional/A-B, prepopulação por variável, analytics sem configuração e página terminal, concluindo uma única resposta canônica.
- O preview alternou desktop, tablet e celular sem persistência: durante a prova a contagem permaneceu 25 → 25. A contagem final posterior é 23 porque fixtures históricas de preview foram removidas atomicamente; não é perda causada pelo teste atual.
- A indisponibilidade/configuração ausente de analytics passou a ser não bloqueante para o lead, mas continua observável como `skipped`/`failed`.

Essas evidências comprovam funcionamento e isolamento; não substituem Lighthouse, RUM ou carga concorrente. No snapshot exato, `npm run verify` aprovou 73 arquivos/548 testes Vitest e todos os budgets acima; as 25 Edge Functions passaram no type-check e 82 testes Deno; o probe publicado aprovou 70/70 requisições, erro 0% e p95 agregado de 500,44 ms.

## Certificações e medições ainda necessárias

- Lighthouse/WebPageTest com Android intermediário, 4G representativo e CPU limitada.
- RUM de LCP, INP, CLS, TTFB e taxa de erro por release SHA.
- Teste de deploy novo com aba antiga aberta para comprovar recuperação de chunk real.
- Cache frio/quente, falha parcial de rede e fallback do service worker no domínio Vercel.
- Teste de carga/soak de leitura, sessão, autosave e conclusão; bundle pequeno não garante capacidade do backend.
- Repetir `npm run verify`/budget em toda release futura e atualizar esta tabela se qualquer byte ou arquivo mudar.
