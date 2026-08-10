# Plano completo de auditoria, migração, performance e segurança

> Projeto auditado: `twobrain-forms`<br>
> Data do diagnóstico: 10/08/2026<br>
> Escopo: preservar 100% das funcionalidades, manter a cópia original da Twobrain, criar uma edição independente com nova identidade, migrar GitHub e Supabase com segurança e elevar qualidade, velocidade e observabilidade.

## 1. Resumo executivo

O produto tem uma base funcional ampla e boas iniciativas de divisão de bundle, mas ainda não está pronto para ser tratado como um “Typeform padrão” confiável. A recomendação é **não reescrever tudo nem migrar todo o editor para Astro agora**. O editor, canvas, construtor de páginas, workflows e dashboards são aplicações altamente interativas e continuam adequados para React. A rota pública dos formulários é a melhor candidata para Astro/SSR/ilhas, mas essa decisão só deve ser tomada depois de criar uma baseline mensurável e uma suíte de regressão.

A arquitetura-alvo recomendada é híbrida:

- **Editor/admin:** React, com Vite ou Astro hospedando ilhas React; componentes pesados carregados sob demanda.
- **Formulário público:** Astro SSR/ilhas ou uma aplicação pública React mínima, escolhida por benchmark comparativo.
- **Backend:** Supabase independente, com RLS por proprietário/tenant, Edge Functions autenticadas por padrão e endpoints públicos mínimos, validados e limitados.
- **Código compartilhado:** schemas, tipos, regras de fluxo, validação e tema em pacotes internos, sem duplicar regras entre editor, preview e backend.

## 2. Estado atual verificado

### Arquitetura e escopo

- SPA React 18 + Vite 5 + TypeScript + React Router + Tailwind + shadcn/Radix.
- Aproximadamente 55 mil linhas TS/TSX/SQL, 215 arquivos TS/TSX, 21 Edge Functions e 23 migrações SQL.
- Recursos identificados: autenticação e perfis, dashboard, pastas/tags, galeria, editor de páginas, editor de fluxo, condições, variáveis, A/B test, IA, imagens, e-mail, WhatsApp, webhook, SEO, compartilhamento, analytics, respostas, gráficos, uploads, integrações e formulário público.
- O Supabase versionado aponta para o projeto de referência `mbryndcvumhfjgmogifs`. A correspondência com a conta/projeto remoto e o ambiente em produção ainda precisa ser confirmada no painel/CLI antes de qualquer ação.
- O repositório atual está em `twobrainbr/twobrain-forms`, branch `main`, sincronizado no commit observado durante a auditoria.

### Qualidade e reprodutibilidade

- Existem três famílias de lockfile: `package-lock.json`, `bun.lock` e `bun.lockb`.
- `npm ci` falha porque `package.json` e `package-lock.json` estão dessincronizados.
- Não há CI/CD versionado, Dockerfile ou contrato de deploy identificado.
- O TypeScript está com `strict: false`, `noImplicitAny: false` e verificações de código não utilizado desabilitadas.
- O lint, numa instalação temporária, encontrou **529 ocorrências: 466 erros e 63 avisos**.
- Foram contados aproximadamente 455 usos do token `any` no frontend e nas Edge Functions.
- A suíte possui apenas **um teste trivial**, sem cobertura funcional relevante.
- O build de produção foi concluído somente após uma instalação não reproduzível numa cópia temporária.

### Performance

- O roteamento público/admin e várias telas do editor já usam lazy loading — é uma base positiva.
- Maiores artefatos observados antes de gzip: gráfico ~375 KB, vendor React ~340 KB, AdminApp ~269 KB, PageBuilder ~189 KB, Supabase ~168 KB, workflow ~156 KB e motion ~123 KB.
- CSS principal ~114 KB antes de gzip.
- Componentes críticos excessivamente grandes: `ElementSettingsPanel` (2.769 linhas), `FormPreviewCore` (2.294), `InteractiveElement` (1.391), `FlowCanvas` (1.375) e `EmailBuilderDialog` (1.160).
- Há sinais de dependências incorretas em hooks, estados derivados e componentes grandes que tendem a gerar rerenders caros e bugs de estado obsoleto.
- O service worker implementa cache próprio e precisa de testes de atualização/offline; atualmente o bootstrap também apaga caches fora da rota pública, o que pode causar trabalho e comportamento surpreendente.

### Segurança

- Todas as 21 Edge Functions estão configuradas com `verify_jwt = false`.
- A análise estática não encontrou chamadas reais a `auth.getUser()` nas Edge Functions; muitas aceitam o header de autorização no CORS, mas isso não autentica a requisição.
- Funções com `service_role` acessam configurações, respostas, usuários e integrações. Isso aumenta muito o impacto de falhas de autorização.
- `setup-admin` pode criar o primeiro administrador sem autenticação enquanto a tabela `profiles` estiver vazia — risco crítico durante migração, restauração ou inconsistência de dados.
- `form-public-save` usa `service_role` e aceita operações genéricas de insert/upsert/update sobre sessões e respostas. Mesmo com validação básica, precisa restringir campos, transições e propriedade do registro.
- CORS curinga aparece amplamente. Endpoints administrativos devem aceitar apenas origens conhecidas.
- Algumas políticas históricas permitiram leitura ampla a autenticados e escrita pública de sessões/respostas. Há migrações corretivas posteriores, mas o estado efetivo do banco remoto precisa ser inspecionado.
- Configurações de integrações e tokens estão na tabela `integration_settings`; é preciso confirmar criptografia, rotação, acesso e ausência de exposição ao cliente.
- A CSP atual permite `'unsafe-inline'` e `'unsafe-eval'`; `X-XSS-Protection` é legado. Falta validar se os headers são realmente servidos pelo provedor atual.
- O “security guard” que bloqueia botão direito/F12 não protege código ou dados e prejudica acessibilidade/suporte; segurança real deve estar no servidor, RLS e headers.
- A instalação temporária reportou 12 alertas de dependências de runtime (11 altos e 1 moderado), incluindo a cadeia de React Router. O resultado deve ser revalidado após fixar um único lockfile.

## 3. Classificação de prioridade

| Nível | Significado | Exemplos neste projeto |
|---|---|---|
| P0 — crítico | Pode expor dados, assumir controle ou impedir reprodução/migração segura | Edge Functions sem JWT/auth real; bootstrap de admin; `service_role`; políticas efetivas desconhecidas; backup/restore não provado; `npm ci` quebrado |
| P1 — alto | Pode causar perda de funcionalidade, bugs recorrentes ou lentidão grave | ausência de testes; 466 erros de lint; TS não estrito; componentes monolíticos; bundles grandes; ausência de CI |
| P2 — médio | Afeta manutenção, UX, acessibilidade e operação | service worker/cache; observabilidade; responsividade; CSP; duplicação de toasts; documentação genérica |
| P3 — melhoria | Refinamento após estabilidade comprovada | Astro para rota pública; design system da nova marca; otimizações finas e remoção de dívida |

## 4. Princípios obrigatórios

1. **Nenhum recurso removido silenciosamente.** Toda mudança precisa mapear recurso antigo → teste de paridade → recurso novo.
2. **Segurança antes da transferência de dados.** Não copiar produção para um backend ainda aberto.
3. **Migração reversível.** A Twobrain mantém sua cópia e nenhum histórico é reescrito sem aprovação explícita.
4. **Nova identidade sem misturar propriedade.** Novo repositório, novo Supabase, novos secrets, domínios e contas de integrações.
5. **Decisão por métricas.** Astro só entra onde superar a baseline sem quebrar editor, analytics, embeds, pixels ou formulários.
6. **Pequenos lotes.** Cada fase termina com testes, evidências e rollback definidos.
7. **Dados pessoais tratados como produção.** Backups cifrados, acesso mínimo, retenção definida e conformidade LGPD.

## 5. Plano por fases

## Fase 0 — Congelamento, inventário e baseline (P0)

Objetivo: saber exatamente o que existe e impedir perda/regressão.

- [ ] Criar branch/tag imutável do estado atual e registrar commit, ambiente e deploy ativo.
- [ ] Identificar hospedagem, domínio, conta Lovable, projeto Supabase real, regiões e integrações externas.
- [ ] Inventariar variáveis por **nome e finalidade**, nunca copiar valores para documentação.
- [ ] Gerar matriz completa de recursos, tipos de pergunta/elemento, workflows, permissões, integrações e estados do formulário.
- [ ] Criar fixtures sem dados pessoais: formulário simples, multipágina, condicional, upload, webhook, e-mail, WhatsApp, IA, gráficos, SEO e analytics.
- [ ] Medir em desktop e mobile: LCP, INP, CLS, TTFB, peso JS/CSS, tempo do editor, memória e long tasks.
- [ ] Registrar erros reais de navegador/API e taxas de falha do ambiente atual.
- [ ] Fazer backup lógico e de Storage do Supabase atual; provar restauração em projeto descartável.
- [ ] Produzir diagrama de dados, Edge Functions e dependências externas.

**Gate de saída:** inventário assinado, fixtures reproduzíveis, backup restaurado e métricas-base salvas.

## Fase 1 — Separação de propriedade GitHub (P0)

Objetivo: manter a Twobrain intacta e criar a edição pessoal independente.

- [ ] Confirmar titular, organização/conta destino, visibilidade e regras de acesso.
- [ ] Preferir **novo repositório criado a partir de clone/mirror**, preservando todo o histórico; não transferir o repositório original.
- [ ] Manter `origin` apontando para a cópia pessoal e adicionar `twobrain` como remote somente leitura no clone pessoal.
- [ ] Configurar identidade Git correta antes do primeiro commit.
- [ ] Copiar apenas código/histórico; recriar deploy keys, webhooks, Actions secrets, ambientes e protections.
- [ ] Executar secret scanning no histórico antes de tornar o novo repositório público ou compartilhá-lo.
- [ ] Definir proteção de `main`, PR obrigatório, CODEOWNERS, Dependabot/Renovate e commits assinados se aplicável.
- [ ] Substituir README genérico do Lovable por setup, arquitetura, ambientes, deploy, segurança e recuperação.

**Rollback:** o repositório Twobrain não é alterado; apagar a cópia pessoal não afeta a origem.

**Gate de saída:** clone limpo instala, testa e builda no novo repositório, sem acessar secrets/infra da Twobrain.

## Fase 2 — Fechar falhas críticas antes de migrar dados (P0)

Objetivo: tornar o backend seguro por padrão.

- [ ] Classificar cada Edge Function como `pública`, `usuário autenticado`, `admin` ou `sistema/webhook`.
- [ ] Ativar verificação JWT por padrão; manter `verify_jwt = false` apenas em endpoints genuinamente públicos/webhooks.
- [ ] Nas funções autenticadas, validar token via Supabase Auth e autorização por owner/role no servidor.
- [ ] Em webhooks, exigir assinatura HMAC, timestamp, proteção contra replay e idempotency key.
- [ ] Desativar `setup-admin` após provisionamento ou protegê-la com segredo de uso único, expiração e bloqueio transacional.
- [ ] Restringir `admin-create-user`, MinIO, integrações, IA, análises, e-mail e WhatsApp a papéis explícitos.
- [ ] Trocar CORS curinga por allowlist nos endpoints privados; limitar métodos e headers.
- [ ] Substituir writes genéricos de `form-public-save` por comandos fechados com schemas, allowlist de campos e transições válidas.
- [ ] Implementar rate limit por IP/formulário/chave, limites de payload, timeout, quotas e proteção anti-bot adaptativa.
- [ ] Validar upload por conteúdo real, tamanho, extensão, nome seguro, antivírus e URLs assinadas.
- [ ] Impedir SSRF em webhook, MinIO, imagens e integrações: bloquear IPs privados/metadata, validar DNS e protocolos.
- [ ] Revisar HTML rico, templates de e-mail, variáveis, URLs e redirects contra XSS, injection e open redirect.
- [ ] Remover mensagens internas/stack traces das respostas públicas e adotar IDs de correlação.
- [ ] Rotacionar secrets após migração; nunca reutilizar chaves da Twobrain.
- [ ] Criar testes negativos de IDOR: usuário A nunca lê/edita respostas, forms, arquivos ou integrações de B.

**Gate de saída:** pentest automatizado/manual básico sem bypass P0/P1 e matriz de autorização coberta por testes.

## Fase 3 — Supabase novo e migração controlada (P0/P1)

Objetivo: mover schema, dados e integrações para uma conta independente sem perda.

- [ ] Criar projeto Supabase pessoal com região, plano, PITR/backups, MFA e membros mínimos.
- [ ] Aplicar migrações do zero em banco vazio; eliminar dependência de mudanças manuais do painel.
- [ ] Comparar schema versionado × schema remoto: tabelas, colunas, constraints, índices, triggers, functions, extensões, RLS, policies, buckets e cron jobs.
- [ ] Criar migração corretiva append-only; não editar migrações já aplicadas.
- [ ] Revisar toda policy por papel e tenant; evitar `auth.role() = 'authenticated'` como autorização de negócio.
- [ ] Versionar configuração segura de buckets e Edge Functions.
- [ ] Migrar usuários com estratégia explícita: import suportado, reset de senha ou janela de transição; não improvisar hashes.
- [ ] Exportar/importar dados por ordem de FK, preservando IDs e timestamps.
- [ ] Migrar Storage com checksum, contagem, MIME e amostra de abertura.
- [ ] Recriar secrets/integrations com credenciais pessoais novas e validar OAuth redirect URIs/domínios.
- [ ] Fazer dry-run com dados anonimizados; depois ensaio completo e relatório de diferenças.
- [ ] Planejar cutover: janela, freeze de escrita, delta final, troca de env/DNS, smoke tests e rollback.
- [ ] Manter origem em modo somente leitura durante período acordado; depois aplicar política de retenção/eliminação autorizada.

**Gate de saída:** contagens e checksums reconciliados, autenticação e funções testadas, backup e rollback provados.

## Fase 4 — Reprodutibilidade, CI e saúde do código (P0/P1)

Objetivo: qualquer clone limpo produzir o mesmo sistema.

- [ ] Escolher **um** gerenciador (recomendação inicial: npm, por já estar documentado) e manter um único lockfile.
- [ ] Sincronizar lockfile e tornar `npm ci` obrigatório.
- [ ] Fixar versões de Node/npm e Supabase CLI; documentar suporte.
- [ ] Adicionar scripts: `typecheck`, `lint`, `test`, `test:integration`, `test:e2e`, `build`, `audit` e `verify`.
- [ ] Habilitar TypeScript estrito gradualmente por pastas; começar em schemas/segurança/backend.
- [ ] Corrigir os 466 erros de lint por categoria, sem aplicar autofix cego em lógica.
- [ ] Criar CI em PR: clean install, secret scan, typecheck, lint, testes, build, migrations reset, RLS tests e bundle budget.
- [ ] Separar lint/config de browser e Deno Edge Functions.
- [ ] Atualizar dependências vulneráveis em lotes pequenos; revalidar `npm audit` e testes após cada lote.
- [ ] Adicionar preview environment isolado, sem dados/secrets de produção.
- [ ] Definir release com commit/SHA rastreável e rollback para artefato anterior.

**Gate de saída:** pipeline verde em clone limpo e deploy reproduzível a partir de um SHA.

## Fase 5 — Suíte caça-bugs e contrato de paridade (P1)

Objetivo: transformar “não remover funcionalidade” em prova automatizada.

- [ ] Unit tests para schemas, condições, interpolação, máscaras, e-mail, integridade, criptografia e payloads.
- [ ] Property/fuzz tests para motor condicional, variáveis, workflow e inputs públicos.
- [ ] Integration tests com Supabase local para migrations, RLS, Auth, Edge Functions, uploads e realtime.
- [ ] E2E em Chromium/WebKit/Firefox e viewport mobile para criação → publicação → resposta → analytics.
- [ ] Cobrir todos os tipos de pergunta e elementos de página identificados.
- [ ] Cobrir save automático, undo/redo, drag-and-drop, duplicação, exclusão, conexões, loops inválidos e concorrência.
- [ ] Cobrir formulário aberto/fechado, limite de respostas, datas, redirecionamento e recuperação de rede.
- [ ] Cobrir e-mail, WhatsApp, webhook, Google Sheets/OAuth, pixels, IA e MinIO com servidores mock.
- [ ] Testar acessibilidade automatizada e manual: teclado, foco, leitor de tela, contraste, zoom 200%, reduced motion.
- [ ] Testar cache/service worker: primeira visita, atualização de versão, offline, cache corrompido e rollback.
- [ ] Criar testes visuais para editor, preview e formulário publicado.
- [ ] Adotar política de bug: reprodução mínima, teste que falha, correção, teste que passa, causa raiz e prevenção.

**Gate de saída:** matriz de paridade 100% coberta nos fluxos críticos; zero P0/P1 conhecidos.

## Fase 6 — Performance no React atual (P1)

Objetivo: colher ganhos seguros antes de trocar framework.

- [ ] Medir bundles por rota e definir budgets: público, admin e editor separadamente.
- [ ] Lazy-load de dashboard, galeria, settings, gráficos, editores de e-mail/imagem e integrações somente quando usados.
- [ ] Evitar barrel imports e importar ícones/componentes diretamente.
- [ ] Isolar `recharts`, `framer-motion`, canvas e editores pesados em chunks condicionais.
- [ ] Dividir componentes monolíticos por responsabilidade, mantendo estado perto do consumidor.
- [ ] Corrigir dependencies de hooks e stale closures antes de adicionar memoização.
- [ ] Reduzir assinaturas amplas em stores/contextos; usar seletores e estado derivado mínimo.
- [ ] Virtualizar respostas, analytics, opções e painéis longos; usar `content-visibility` quando apropriado.
- [ ] Paralelizar consultas independentes, remover waterfalls e deduplicar fetches.
- [ ] Usar transitions/deferred values no editor para manter digitação e drag responsivos.
- [ ] Adiar pixels, analytics e bibliotecas não críticas para depois da interação/hidratação.
- [ ] Revisar fontes, imagens, compressão, preloads e cache headers por ambiente.
- [ ] Simplificar o service worker ou removê-lo se o benefício offline não superar o risco de cache obsoleto.
- [ ] Testar em dispositivo Android mediano e rede 4G lenta, não apenas desktop local.

**Meta inicial a confirmar pela baseline:** público com LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 no p75; nenhum long task crítico durante preenchimento; editor interativo sem travar digitação/drag.

## Fase 7 — Spike Astro e decisão arquitetural (P1/P2)

Objetivo: provar se Astro traz ganho real sem reescrita arriscada.

- [ ] Criar spike de uma rota pública representativa em Astro SSR/ilhas React.
- [ ] Manter o mesmo schema, renderer, validações, analytics e integração Supabase.
- [ ] Comparar com React otimizado: TTFB, JS enviado, hidratação, LCP/INP, SEO, cache, custo operacional e complexidade.
- [ ] Testar embeds, query params, pixels, redirects, service worker, sessões parciais e retomada.
- [ ] Não migrar o canvas/editor para componentes `.astro`; usar React islands para toda interação complexa.
- [ ] Se o spike vencer os budgets e a manutenção for aceitável, migrar primeiro `/f/:id` e páginas institucionais.
- [ ] Se não vencer, manter React/Vite e investir em renderização pública mínima/SSR sem troca cosmética de framework.

**Critério de decisão:** ganho mensurável relevante e nenhuma regressão funcional. “Astro parece mais rápido” não é critério suficiente.

## Fase 8 — Modularização e modelo de domínio (P1/P2)

Objetivo: reduzir bugs ao tornar regras únicas e testáveis.

- [ ] Extrair schemas runtime (ex.: Zod ou alternativa já escolhida) para forms, pages, elements, workflows e payloads.
- [ ] Versionar o formato dos formulários e criar migrações de documento para versões antigas.
- [ ] Separar renderer público, editor, domínio, infraestrutura Supabase e integrações.
- [ ] Unificar regras usadas em editor, preview, formulário publicado e Edge Functions.
- [ ] Dividir `FormPreviewCore`, `ElementSettingsPanel`, `InteractiveElement`, `FlowCanvas` e builders por feature, não por abstrações genéricas.
- [ ] Criar contrato fechado para nodes/actions; validação exhaustiva em switches.
- [ ] Padronizar erros, retries, idempotência e cancelamento de requests.
- [ ] Remover código morto apenas após cobertura e busca de uso dinâmico.

**Gate de saída:** módulos críticos com interfaces pequenas, testes próprios e budgets de tamanho/complexidade.

## Fase 9 — Nova identidade visual e produto independente (P2)

Objetivo: trocar a marca sem contaminar regras de negócio.

- [ ] Inventariar logos, nomes, cores, fontes, ícones, textos, metadados, e-mails, domínio e assets Twobrain.
- [ ] Confirmar direitos/licenças de fontes e assets antes de copiá-los.
- [ ] Criar tokens semânticos (`brand`, `surface`, `text`, `danger`, etc.) e tema pessoal.
- [ ] Separar configuração de marca de componentes funcionais.
- [ ] Atualizar favicon, OG, manifest, robots, SEO, templates de e-mail e remetentes.
- [ ] Garantir WCAG AA, dark/light se suportados e responsividade 320 px → desktop amplo.
- [ ] Fazer regressão visual de todas as telas e estados: vazio, loading, erro, offline, sem permissão e conteúdo extremo.
- [ ] Remover nomes/URLs Twobrain somente na cópia pessoal; preservar a origem.

## Fase 10 — Observabilidade, privacidade e operação (P1/P2)

Objetivo: detectar bugs antes do usuário e responder sem expor dados.

- [ ] Error tracking frontend/backend com source maps privados, release SHA e scrub de PII/secrets.
- [ ] Métricas de latência/erro por função, integração, upload e publicação.
- [ ] Logs estruturados com correlation ID, sem respostas, tokens, e-mails ou conteúdo sensível.
- [ ] Alertas por SLO, não por ruído; dashboards de disponibilidade e filas.
- [ ] Health checks e synthetic tests de formulário público e login.
- [ ] Política LGPD: base legal, consentimento, exportação, retenção, exclusão e registro de operadores.
- [ ] Runbooks: incidente, vazamento, restore, rotação de secrets, rollback e integração fora do ar.
- [ ] Backups automáticos com teste periódico de restauração.

## Fase 11 — Cutover e estabilização (P0/P1)

- [ ] Release candidate congelado e aprovado pela matriz de paridade.
- [ ] Executar migração final com logs e checksums.
- [ ] Trocar domínio/env somente após smoke tests internos.
- [ ] Fazer canary progressivo e monitorar erros, performance, Auth, respostas e integrações.
- [ ] Manter rollback pronto para frontend e banco; evitar mudanças destrutivas incompatíveis durante a janela.
- [ ] Rodar testes de jornada pós-deploy e conferir dados gravados/lidos.
- [ ] Período de estabilização com triagem diária de P0/P1 e revisão de métricas.
- [ ] Só encerrar quando produção, dados, integrações, observabilidade e recuperação estiverem confirmados.

## 6. Backlog técnico inicial priorizado

### P0 — iniciar imediatamente

1. Provar backup/restore do Supabase e identificar o projeto/conta/deploy efetivos.
2. Fechar `setup-admin` e autenticar/autorizar Edge Functions privilegiadas.
3. Restringir `form-public-save`, CORS, rate limits e políticas RLS efetivas.
4. Escolher um package manager, corrigir lockfile e recuperar `npm ci`.
5. Criar testes de autorização/IDOR e um E2E de publicação/resposta.
6. Criar repositório pessoal sem alterar a cópia Twobrain e fazer secret scan.

### P1 — em seguida

1. CI completo e Supabase local resetável.
2. Atualizar dependências vulneráveis e revalidar árvore.
3. Corrigir lint/hook bugs e ativar TypeScript estrito progressivamente.
4. Cobertura de recursos e integrações críticas.
5. Otimizar bundles e quebrar componentes monolíticos.
6. Migrar Supabase em ensaios, com checksums e rollback.

### P2/P3 — depois da estabilidade

1. Spike Astro da rota pública e decisão por benchmark.
2. Nova identidade visual via tokens e assets licenciados.
3. Simplificar service worker, toasts e código defensivo cliente.
4. Observabilidade avançada, acessibilidade completa e performance fina.

## 7. Auditoria Ponytail — complexidade removível

- `delete:` bloquear F12/botão direito não oferece segurança; remover `securityGuard` e proteger servidor/RLS/headers. [`src/lib/securityGuard.ts`]
- `delete:` manter três lockfiles cria três fontes de verdade; escolher um gerenciador e apagar os outros dois lockfiles. [raiz]
- `shrink:` existem dois sistemas de toast ativos; padronizar um e remover provider, hook e componentes do outro. [`src/AdminApp.tsx`, `src/hooks/use-toast.ts`, `src/components/ui/toast.tsx`]
- `delete:` `tailwindcss-animate` não apareceu importado na fonte; confirmar uso indireto/config e remover se realmente morto. [`package.json`]
- `yagni:` wrappers/guards de recuperação e cache no bootstrap devem ser mantidos apenas se testes reproduzirem os problemas que resolvem. [`src/main.tsx`, `public/sw.js`]

**Estimativa conservadora após confirmação por testes:** `net: -300 a -700 linhas, -2 a -4 dependências possíveis.` Essa estimativa não inclui modularização de componentes, que deve reduzir complexidade, mas pode não reduzir linhas inicialmente.

## 8. Gates de qualidade para declarar “pronto”

- [ ] Clone limpo instala com comando único e sem alterar lockfile.
- [ ] Typecheck, lint, testes, build, migrations e segurança verdes no CI.
- [ ] Zero vulnerabilidade crítica/alta explorável sem mitigação documentada.
- [ ] Zero bug P0/P1 conhecido; P2/P3 com owner e prazo.
- [ ] 100% dos recursos da matriz de paridade aprovados.
- [ ] Testes negativos de tenant/owner/RLS aprovados.
- [ ] Backup e restore provados; rollback de deploy provado.
- [ ] Budgets Core Web Vitals e bundle atingidos no p75 real.
- [ ] WCAG AA nos fluxos críticos e operação completa por teclado.
- [ ] Produção pessoal sem dependência de conta, secret, domínio ou projeto Twobrain.
- [ ] Cópia Twobrain preservada e verificável.
- [ ] Documentação de arquitetura, deploy, migração, incidentes e dados atualizada.

## 9. Ordem recomendada de execução

```text
Inventário + backup
        ↓
Cópia GitHub independente
        ↓
Hardening P0 + testes de autorização
        ↓
Reprodutibilidade + CI + suíte de paridade
        ↓
Novo Supabase + ensaios de migração
        ↓
Otimização do React atual
        ↓
Spike Astro da rota pública
        ↓
Nova identidade visual
        ↓
Cutover, observabilidade e estabilização
```

## 10. Primeira entrega prática sugerida

O primeiro ciclo deve ser curto e verificável:

1. Criar inventário de ambientes/recursos e backup restaurável.
2. Criar a cópia pessoal do GitHub preservando o original.
3. Consolidar npm e fazer `npm ci` funcionar.
4. Adicionar CI mínimo com typecheck/lint/test/build.
5. Corrigir o bootstrap de admin e estabelecer autenticação real nas funções privilegiadas.
6. Criar os primeiros E2E e testes de RLS antes de qualquer migração de dados.

Somente após esse ciclo vale iniciar a migração do Supabase ou a troca de framework. Isso preserva funcionalidade, cria uma rede de segurança e transforma cada etapa seguinte em uma mudança mensurável e reversível.
