# Auditoria corporativa executada — Forms

Data da auditoria inicial: 10 de agosto de 2026

Atualização de release: 11 de agosto de 2026

Escopo: frontend público, editor, autenticação, persistência, Supabase, Edge Functions, integrações, desempenho, acessibilidade e operação.

## Parecer executivo

O sistema saiu de uma condição inadequada para produção — com leitura e escrita públicas excessivas, funções com efeitos externos replayáveis, dados sensíveis entregues ao navegador e falhas de persistência em campos aninhados — para uma release publicada com autorização server-side, persistência canônica, criptografia, idempotência e recuperação assíncrona.

O snapshot atual recebeu **GO técnico da release no ambiente de produção**. Vercel, Supabase, Edge Functions, migrations, cron/worker, HTML server-side e o fluxo público real foram implantados e exercitados. A rodada integrada exata foi repetida depois das últimas correções e seus totais finais estão registrados abaixo. Certificações contínuas, integrações sem credencial e testes operacionais ampliados permanecem explicitamente separados deste GO.

Integrações sem credencial ou sandbox fornecido permanecem desativadas e não são apresentadas como “validadas”. Reoon é a exceção desta rodada: foi validado pelo servidor no provedor, salvo mascarado/criptografado e marcado ativo. Resultados que só passam a existir depois de webhook, IA ou imagem externa continuam deliberadamente fail-closed até haver traço canônico persistido e autorizado.

Não existe promessa responsável de “zero bugs”. O objetivo corporativo adotado é: evitar perda silenciosa de dados, falhar de forma segura, detectar regressões automaticamente, limitar o impacto de incidentes e manter evidência reproduzível dos testes.

## Decisão de arquitetura

### Frontend

**Manter React + Vite agora. Não migrar para Astro nesta fase.** O produto é uma aplicação altamente interativa: editor visual, grafo, condições, estado de sessão, autosave e dezenas de componentes de campo. Astro ajudaria páginas predominantemente estáticas, mas obrigaria a re-hidratar quase todo o runtime do formulário e do editor. Isso elevaria o risco de regressão sem ganho proporcional.

A estratégia aplicada foi separar a rota administrativa da rota pública, carregar componentes pesados sob demanda, retirar o SDK completo do Supabase do caminho público e reduzir o payload entregue ao respondente.

### Backend

**Manter Supabase + Edge Functions agora. Não introduzir NestJS sem um requisito operacional concreto.** Autenticação, RLS, Postgres, storage e funções já cobrem o domínio. Um backend Nest duplicaria autenticação, autorização, deploy e observabilidade. O limite para reavaliar é: workflows assíncronos duráveis, filas com garantia, jobs de longa duração, alto volume sustentado ou integrações que exijam orquestração transacional.

## Achados críticos corrigidos

| Severidade | Achado | Correção executada | Evidência |
|---|---|---|---|
| P0 | Formulários publicados podiam ser lidos diretamente da tabela, expondo o blob administrativo | Acesso público direto revogado; entrega somente por `form-public-get` sanitizado | REST direto retorna 401; Edge retorna somente dados públicos |
| P0 | Respostas, sessões e eventos aceitavam escrita pública direta | Políticas públicas removidas; escrita somente por função assinada | Chamada sem token retorna 401 |
| P0 | Configurações de webhook, WhatsApp, e-mail e IA chegavam ao navegador | Função pública remove destinos, headers, templates, instâncias, prompts e modelos sensíveis | Varredura do payload real não encontrou chaves sensíveis |
| P0 | Funções externas podiam ser acionadas apenas com parâmetros fornecidos pelo cliente | Token de submissão assinado + validação de formulário/nó + configuração autoritativa do banco | Nós inexistentes retornam 403 |
| P0 | Orquestrador legado podia repetir e-mail, WhatsApp, IA e webhook | `execute-workflow` restrito a chamadas internas com service role | Chamada pública retorna 401 |
| P0 | Campos dentro de Colunas não eram tratados por toda a cadeia | Travessia recursiva aplicada a defaults, validação, condições, score, exportação, integrações e persistência | Testes de propagação e matriz completa de elementos |
| P1 | HTML rico podia introduzir XSS | Sanitização com DOMPurify no editor e na visualização | Testes específicos de payload malicioso |
| P1 | Upload/remoção MinIO não isolava claramente o proprietário | Objetos novos em namespace por usuário; exclusão só do próprio namespace ou por admin | Autorização centralizada nas funções |
| P1 | OAuth Google usava estado sem assinatura robusta | Estado assinado, com expiração e URL de retorno validada | Funções de início/callback atualizadas |
| P1 | Webhooks aceitavam destinos HTTP/privados | HTTPS obrigatório e bloqueio de localhost/faixas privadas | Aplicado em fluxo público, conclusão, pixel e teste |
| P1 | Exclusão de formulário deixava telemetria órfã | Trigger de limpeza e saneamento dos órfãos existentes | Migração aplicada no banco novo |
| P1 | Cache de validação de e-mail retinha PII desnecessária | E-mail normalizado armazenado como hash; retenção reduzida | Migração e função implantadas |
| P1 | Cadastro público e corrida no primeiro administrador permitiam contornar o token de setup | Todos os provedores públicos desativados; trigger sempre cria `user`; claim PostgreSQL atômico, promoção com ACK e rollback | 10 testes pgTAP do bootstrap, testes Deno e `setupRequired: false` em produção |
| P1 | Ausência de limites de abuso | Rate limit persistente para endpoints públicos e integrações | Contrato validado no ambiente remoto |

## Cobertura funcional

- 48 tipos de elemento declarados são criados, serializados e renderizados no editor.
- Os mesmos 48 tipos são exercitados no runtime público; os tipos de mídia vazios são aceitos como ausência visual intencional.
- 20 tipos de campo de resposta cobrem texto, e-mail, telefone, número, textarea, data/hora, endereço, documento, empresa, altura/peso, checkbox, seleção, rádio, rating, NPS, sim/não, múltipla seleção e quizzes.
- Campos aninhados em Colunas participam de `answers`, obrigatoriedade, validadores assíncronos, condições, score, variáveis, webhooks, planilhas, respostas e exportação.
- Validação obrigatória cobre valores simples e compostos; CPF/CNPJ inválido e limites numéricos são rejeitados.
- Um ensaio real criou um formulário isolado, publicou, submeteu nome/e-mail, confirmou a tela final, conferiu a resposta persistida no painel e removeu a fixture.
- No formulário publicado atual, um e-mail de formato inválido foi bloqueado no navegador sem envio.

### Evidência da release publicada

- O snapshot final aprovou **73 arquivos / 548 testes Vitest**, TypeScript, ESLint, build Vite e orçamento de bundle no Node 24.
- As **25 Edge Functions** passaram no `deno check --frozen` e a suíte Deno final aprovou **82 testes**. `npm audit --omit=dev` retornou **0 vulnerabilidades**.
- O probe HTTP read-only do domínio publicado aprovou **70/70** requisições, erro **0%** e p95 agregado de **500,44 ms**; shell, Open Graph, metadata e runtime ficaram dentro de seus budgets.
- As **25 Edge Functions** da release ficaram ativas no projeto remoto; as migrations remotas ficaram alinhadas e o lint de nível erro retornou zero achado.
- Um E2E em `forms-olive-three.vercel.app` percorreu condição/A-B, variável pré-populada, nó de analytics sem configuração e uma página terminal vazia; a navegação chegou à tela de obrigado e o banco registrou uma única resposta canônica concluída, com answers criptografados.
- Analytics não configurado agora registra tentativa e telemetria como `skipped`/`failed`, devolve prova de workflow autorizada e nunca decide rota nem valor. A indisponibilidade de tracking não pode descartar o lead.
- Uma página persistida alcançada deterministicamente pode encerrar o fluxo mesmo sem aresta de saída, inclusive quando vazia. O cliente não pode forjar esse destino porque a travessia continua validada pelo grafo armazenado.
- O preview foi aberto no ambiente publicado e alternado entre desktop, tablet e celular. Durante a prova, a contagem canônica permaneceu **25 → 25**, comprovando que a execução atual não criou resposta, sessão, evento, pixel ou entrega externa.
- A auditoria encontrou depois três sessões históricas marcadas `editorPreview`, anteriores à release: duas respostas e oito page events, sem pixels, workflow ou deliveries. A remoção foi atômica e restrita a essas fixtures sintéticas. O estado final ficou em **23 respostas (8 completas/15 parciais)**, **23/23 answers criptografados**, **23/23 metadata criptografada ou nula** e **0 sessões de preview**.
- Os dumps pré-release permanecem preservados fora do repositório em `/tmp/forms-production-pre-release-schema-20260811.sql` e `/tmp/forms-production-pre-release-data-20260811.sql`.
- Na análise “Por página”, cada resposta continua em sua própria coluna. Uma linha superior cria grupos de página por `colSpan` e `scope="colgroup"`, equivalente a uma célula mesclada de Excel, sem adicionar card/bloco acima da tabela.
- O HTML público respondeu com title, description, canonical, OG/Twitter/Pinterest, JSON-LD e thumbnail PNG 1200×630, além de CSP, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy e proteção de frame.

## Persistência e integridade

Fluxo público:

1. `form-public-get` recebe um UUID válido e retorna somente formulário publicado/fechado.
2. A função emite token assinado de submissão com expiração.
3. Sessão, resposta e evento passam por `form-public-save`.
4. A função valida token, status do formulário, ação, colunas permitidas, tamanho e taxa.
5. Campos sensíveis são criptografados no servidor e o envio falha de forma fechada se o segredo não existir.
6. Integrações resolvem o nó e sua configuração diretamente do banco; o cliente não escolhe credenciais/destinos.

Proteções adicionais:

- RLS por proprietário para formulários, respostas, sessões e telemetria.
- Administradores mantêm acesso global explícito.
- Configurações de integração são visíveis e mutáveis apenas por administradores.
- Exclusão do formulário remove respostas, sessões, eventos e logs relacionados.
- O schema remoto passou no lint de nível erro após a aplicação das migrations desta release.

### Atualização: validação reproduzível e aplicação das migrations

As **48 migrations** do repositório foram aplicadas do zero em um Supabase descartável compatível com PostgreSQL 15 e também aplicadas de forma controlada no projeto de produção. O resultado foi:

- `supabase db reset`: todas as migrations aplicadas sem erro;
- `supabase db lint --local --schema public --level warning --fail-on error`: zero erro;
- `supabase db lint --linked --schema public --level warning --fail-on error`: zero erro no schema remoto atual;
- `supabase db push --linked --dry-run`: limpo depois da publicação remota;
- `supabase test db`: **159 testes pgTAP aprovados em 5 arquivos**;
- `npm run typecheck`: aprovado após sincronizar tabelas e RPCs com o schema gerado localmente.

A regressão encontrou e corrigiu um P0 que o lint estático não detectava: objetos criados pela role local `postgres` herdavam `TRUNCATE`, `REFERENCES` e `TRIGGER` para papéis de API, enquanto faltavam grants normais de `SELECT`/DML para um reset limpo. Antes da correção, `SET ROLE anon; TRUNCATE public.app_settings` era aceito. A migration `20260810224000_explicit_least_privilege_grants.sql` agora:

- revoga todos os privilégios herdados de `PUBLIC`, `anon`, `authenticated` e `service_role` nas tabelas da aplicação;
- concede somente as operações usadas pelo produto e deixa RLS como limite por linha;
- mantém integrações, outbox, ledger de workflow e rate limit acessíveis apenas ao servidor;
- remove `TRUNCATE`, `REFERENCES` e `TRIGGER` de todos os papéis de API;
- fecha os privilégios padrão de futuras tabelas, sequences e funções;
- bloqueia também pastas e galeria quando a conta proprietária está inativa.

Os testes de runtime comprovam ainda: resposta concluída imutável, enqueue transacional, duas destinações sem duplicata, claim concorrente protegido por lease, rotação do fencing token, reclaim após expiração, transição para dead-letter, limpeza em cascata, isolamento owner/admin/inativo, drop-off por página, analytics corporativo em borda de período, resumo da Home sem row cap e cron idempotente que resolve os valores no Vault sem embutir segredo no comando.

A corrida crítica entre conclusão e autosave atrasado também foi reproduzida em duas conexões PostgreSQL reais. A transação de conclusão executou o mesmo `INSERT ... ON CONFLICT DO UPDATE` usado por `form-public-save`, manteve o row lock por dois segundos e recebeu uma tentativa partial 300 ms depois. A tentativa atrasada aguardou o commit e seu próprio `RETURNING` devolveu `canonical-complete | complete | completed_at=true`: o trigger `preserve_completed_form_response` releu o `OLD` já concluído sob o lock e transformou a escrita em no-op. A ordem inversa também converge para a conclusão, pois a partial só pode alterar a linha enquanto `completed_at` ainda é nulo. O teste pgTAP permanente agora cobre explicitamente o upsert da Edge; `loadCanonicalCompletedResponse` relê a linha concluída e as integrações nunca usam o corpo da repetição.

O limite entre RLS e confirmação do cliente também foi auditado. Como o PostgREST pode responder sem erro e com zero linhas quando o registro não existe, a política o oculta ou um predicado de concorrência não confere, as mutações críticas passaram a exigir ACK explícito do identificador/linha e a UI restaura o estado quando ele não chega. Autosave/replay preservam estado pendente/erro e as operações unitárias/lotes conciliam o conjunto retornado. As regressões cobrem `{ data: null, error: null }`, conta inativa, registro removido e conflito; ausência de erro de transporte não é mais tratada sozinha como confirmação canônica.

Uma amostra sintética local, inteiramente revertida ao final, distribuiu **100 mil respostas e 100 mil sessões em 50 formulários**. Com PostgreSQL 15.8 e cache local, `get_forms_home_summary(7)` retornou as 50 linhas em **195 ms** e `get_analytics_dashboard` agregou as 100 mil sessões em **1,70 s**. Esses números comprovam ausência de row cap/N+1 no contrato e servem como baseline, não como SLO de produção; o teste de carga concorrente e o plano de execução com dados reais ainda são gates separados.

O cron foi validado localmente tanto no estado fail-closed quanto com valores descartáveis. Em produção, `project_url` e `delivery_worker_secret` foram configurados no Vault/Edge, o job ficou ativo a cada 10 segundos e uma execução manual do worker retornou sucesso. O segredo chegou a ser rotacionado durante o procedimento e nenhum valor final foi colocado no repositório ou neste relatório.

## Desempenho

> Atualização de release: a medição reproduzível por rota, os limites de CI e o comparativo antes/depois estão em [RELATORIO-PERFORMANCE-RELEASE-2026-08-10.md](./RELATORIO-PERFORMANCE-RELEASE-2026-08-10.md). Os números de chunks isolados abaixo registram a auditoria anterior e não representam o grafo atual completo.

### Medições atuais

- Payload do formulário publicado auditado: **972 bytes** sem compressão reportada pelo cliente HTTP.
- Tempo remoto observado: **338 ms até o primeiro byte** e **340 ms total** na medição de 10/08/2026. É uma amostra, não um SLA.
- Build de produção: **0,85 s** no fechamento da auditoria.
- Chunks públicos principais observados: `FormPreview` 2,17 kB gzip, `FormPreviewCore` 17,64 kB gzip e `InteractiveElement` 12,53 kB gzip.
- SDK do Supabase foi removido do caminho síncrono da rota pública; chamadas Edge usam um cliente `fetch` mínimo.
- Editor/admin, gráficos, seletores complexos e componentes especializados são carregados sob demanda.

### Gatilhos de regressão recomendados

- Payload público: alerta em 100 kB; bloqueio de release em 200 kB para formulário padrão sem mídia.
- Formulário público interativo: bloqueio atual em 305 KiB gzip, incluindo bootstrap, shell, renderer e elemento interativo; redução progressiva guiada por RUM, sem trocar estabilidade por dezenas de requests minúsculos.
- Bootstrap compartilhado: bloqueio em 180 KiB gzip; shell administrativo em 285 KiB gzip.
- Maior chunk JavaScript: bloqueio em 120 KiB gzip; maior CSS em 25 KiB gzip.
- LCP móvel p75: menor que 2,5 s; INP p75 menor que 200 ms; CLS p75 menor que 0,1.
- API de leitura p95: menor que 800 ms; gravação p95 menor que 1,2 s fora de integrações externas.
- Nenhuma imagem acima de 300 kB sem compressão e dimensões responsivas.

O teste definitivo em internet lenta deve ser executado no domínio de produção, com build servido por CDN, perfil móvel e latência real. O servidor Vite local não representa cache, compressão nem edge/CDN de produção.

## Acessibilidade e responsividade

- E-mail usa `type=email`, `autocomplete=email`, nome acessível, estado inválido e vínculo com mensagens.
- Inputs básicos, textarea, número e NPS receberam associação explícita com o título da pergunta.
- Colunas passam para uma coluna em telas até 640 px.
- Navegação por teclado, Enter e atalhos de alternativas permanecem cobertos pelo runtime.
- Motion deve respeitar `prefers-reduced-motion`; isso precisa permanecer como gate visual em todo componente novo.

Pendente para certificação formal: auditoria WCAG 2.2 AA com leitor de tela (VoiceOver/NVDA), contraste de cada tema criado pelo usuário, foco em todos os diálogos e teste completo apenas por teclado.

## Integrações

| Integração | Estado técnico em 11/08/2026 | Dependência externa / decisão |
|---|---|---|
| Supabase Auth/DB/Edge | Produção configurada; migrations, lint, Edge Functions, criptografia, Vault e worker validados | Políticas de plano, backup/PITR e HIBP são escolhas da conta |
| Reoon | **Ativa e validada no provedor**; save server-side, segredo mascarado/criptografado e runtime fail-closed | Monitorar cota/custo da conta ativa |
| Google OAuth/Sheets | Fluxo assinado, refresh, rotação e ACK prontos; desativada | Client ID, client secret, redirect URI, conta e planilha de teste |
| Resend | Função autorizada, ACK/idempotência prontos; desativada | API key, domínio verificado, remetente e destinatário sandbox |
| Evolution/WhatsApp | Função autorizada e ACK de mensagem prontos; desativada | URL HTTPS, API key, instância conectada e número sandbox |
| OpenAI | Integração protegida e validação de completion pronta; desativada | Chave ativa, modelo e orçamento de uso |
| Webhooks | Assinatura, allowlist de nó, HTTPS, SSRF e ACK prontos | Endpoint real de homologação e contrato de payload |
| Pixels | Configuração server-side, deduplicação, logs e modo não bloqueante prontos; provedores não configurados são `skipped` | IDs/tokens de sandbox de cada plataforma |
| MinIO | Namespace, autorização, HTTPS e teste de credencial prontos; desativada | Endpoint, bucket, access key e secret key válidos |

Sem essas credenciais, afirmar que uma integração desativada “funciona completamente” seria incorreto. O código, autorização e contratos estão preparados, mas somente Reoon passou por teste real de provedor nesta rodada.

## Dependências externas e decisões do proprietário

Nenhuma credencial opcional será inventada nem substituída por mock em produção. Para habilitar os conectores hoje desativados, o proprietário precisa fornecer a conta/sandbox correspondente e aprovar o teste real descrito na matriz. Isso não bloqueia o núcleo nem a integração Reoon já ativa.

Decisões operacionais continuam fora do código e devem ser formalizadas conforme o volume comercial crescer:

- plano de backup/PITR, RPO/RTO e rotina de restore drill;
- ferramenta de observabilidade, destinatários e escalonamento dos alertas;
- SLA/SLO contratado, retenção/LGPD e política de exclusão;
- limites de upload, política de replay e allowlist operacional de destinos externos;
- upgrade do plano Supabase caso a proteção HIBP seja desejada.

## Riscos residuais priorizados

| Prioridade | Risco | Tratamento |
|---|---|---|
| P2 | Saída de webhook/IA/imagem ainda não pode alimentar etapas posteriores sem traço canônico | Manter fail-closed; habilitar somente com resultado persistido, prova de autorização e teste no provedor real |
| P2 | Conectores sem credencial não têm ensaio real | Mantê-los desativados e testar happy path, erro e timeout quando cada credencial/sandbox for fornecido |
| P2 | Proteção HIBP depende do plano Supabase Pro | Manter senha forte/MFA disponíveis e decidir upgrade de plano |
| P2 | Bloqueio SSRF por hostname não elimina sozinho todo DNS rebinding | Evoluir para allowlist operacional ou proxy de egress com IP pinning quando o cenário exigir |
| P2 | Carga concorrente, RUM, alerta central e restore drill ainda são certificações operacionais | Executar com volume, plano e responsáveis definidos; não declarar esses ensaios como já realizados |
| P3 | SSR React completo/novo framework não demonstrou benefício mensurável | Manter o shell híbrido e só abrir migração depois de benchmark com a mesma fixture |

## Plano de liberação

### Fase A — concluída

- Migração para repositório e Supabase novos.
- Schema/migrações, autorização e Edge Functions.
- Correções P0/P1 descritas acima.
- Matriz automatizada de elementos, persistência real e budgets de build.
- Snapshot integrado de 548 Vitest e 82 Deno, 48 migrations e 159 pgTAP; schema remoto sem erro de lint.

### Fase B — concluída para o núcleo publicado

- Vercel/CDN, domínio e variáveis de produção.
- Supabase, Edge Functions, Vault, cron/worker e criptografia.
- Reoon validado; conectores sem credencial mantidos desativados.
- HTML/SEO/thumb e headers no domínio real.

### Fase C — concluída para o snapshot da release

- `npm run verify`, Deno, audit e probes foram repetidos após as correções finais e os números exatos estão registrados neste relatório.
- Diff check, varredura da chave Reoon, ausência de referência Lovable no runtime e alinhamento de migrations/implantação foram confirmados antes do commit/push.
- Preservar como certificações separadas, sem fingir conclusão: dispositivo físico/rede degradada, WCAG formal, carga/soak e restore drill.

### Fase D — produção publicada e smoke final aprovado

- Deploy Vercel `dpl_7qFpqdmgsYvL8RL9Edem6qxGmo4Y` e Supabase concluídos; smoke test real aprovado.
- Preview responsivo sem persistência e E2E de conclusão conciliado com o banco; console final sem erro ou aviso.
- O commit/push que contém este relatório materializa o encerramento versionado da release.

## Critério final de GO

Produção recebe **GO** somente quando todos os itens forem verdadeiros:

- Testes, typecheck, lint sem erros e build passam no commit publicado.
- O snapshot exato da release é o mesmo validado e publicado.
- Cada integração habilitada passou em happy path, falha e timeout.
- O domínio publicado passou em persistência e preview sem efeito colateral.
- Riscos e certificações operacionais não executadas estão explicitamente registrados, sem afirmação falsa de cobertura.
- Existe caminho de rollback não destrutivo documentado para frontend, Edge e banco.
