# Auditoria corporativa executada — Forms

Data: 10 de agosto de 2026  
Escopo: frontend público, editor, autenticação, persistência, Supabase, Edge Functions, integrações, desempenho, acessibilidade e operação.

## Parecer executivo

O sistema saiu de uma condição inadequada para produção — com leitura e escrita públicas excessivas, funções com efeitos externos replayáveis, dados sensíveis entregues ao navegador e falhas de persistência em campos aninhados — para uma base tecnicamente apta a staging controlado.

O parecer de produção permanece **NO-GO condicionado**, não por falha conhecida no núcleo de formulário, mas porque as integrações externas ainda não têm credenciais/sandboxes configurados e ainda não existe uma hospedagem de produção com domínio, observabilidade, política de backup e teste de carga acordados. Depois desses gates, deve ser realizado um ensaio final de ponta a ponta no ambiente publicado.

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
| P1 | Função inicial de administrador podia ser explorada em produção | Bootstrap desativado sem habilitação explícita | Endpoint retorna 404 por padrão |
| P1 | Ausência de limites de abuso | Rate limit persistente para endpoints públicos e integrações | Contrato validado no ambiente remoto |

## Cobertura funcional

- 48 tipos de elemento declarados são criados, serializados e renderizados no editor.
- Os mesmos 48 tipos são exercitados no runtime público; os tipos de mídia vazios são aceitos como ausência visual intencional.
- 20 tipos de campo de resposta cobrem texto, e-mail, telefone, número, textarea, data/hora, endereço, documento, empresa, altura/peso, checkbox, seleção, rádio, rating, NPS, sim/não, múltipla seleção e quizzes.
- Campos aninhados em Colunas participam de `answers`, obrigatoriedade, validadores assíncronos, condições, score, variáveis, webhooks, planilhas, respostas e exportação.
- Validação obrigatória cobre valores simples e compostos; CPF/CNPJ inválido e limites numéricos são rejeitados.
- Um ensaio real criou um formulário isolado, publicou, submeteu nome/e-mail, confirmou a tela final, conferiu a resposta persistida no painel e removeu a fixture.
- No formulário publicado atual, um e-mail de formato inválido foi bloqueado no navegador sem envio.

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
- O banco remoto passou no lint de schema após as migrações.

## Desempenho

### Medições atuais

- Payload do formulário publicado auditado: **972 bytes** sem compressão reportada pelo cliente HTTP.
- Tempo remoto observado: **338 ms até o primeiro byte** e **340 ms total** na medição de 10/08/2026. É uma amostra, não um SLA.
- Build de produção: **0,85 s** no fechamento da auditoria.
- Chunks públicos principais observados: `FormPreview` 2,17 kB gzip, `FormPreviewCore` 17,64 kB gzip e `InteractiveElement` 12,53 kB gzip.
- SDK do Supabase foi removido do caminho síncrono da rota pública; chamadas Edge usam um cliente `fetch` mínimo.
- Editor/admin, gráficos, seletores complexos e componentes especializados são carregados sob demanda.

### Gatilhos de regressão recomendados

- Payload público: alerta em 100 kB; bloqueio de release em 200 kB para formulário padrão sem mídia.
- JavaScript inicial público: orçamento de 250 kB gzip; investigar acima de 200 kB.
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

| Integração | Estado técnico | Gate externo |
|---|---|---|
| Supabase Auth/DB/Edge | Configurado e validado | Rotacionar os segredos compartilhados durante a migração |
| Google OAuth/Sheets | Fluxo assinado e persistência recursiva pronta | Client ID, client secret, redirect URI e conta de teste |
| Resend | Função autorizada e configuração server-side | API key, domínio verificado, remetente e destinatário sandbox |
| Evolution/WhatsApp | Função autorizada e configuração server-side | URL HTTPS, API key, instância conectada e número sandbox |
| Reoon | Cache com PII minimizada e função pronta | API key ativa e definição do modo/custo |
| OpenAI/Lovable AI | OpenAI e fallback suportados; análises protegidas | Uma chave/provedor ativo e orçamento de uso |
| Webhooks | Assinatura, allowlist de nó, HTTPS e bloqueio de rede privada | Endpoint de homologação e contrato de payload |
| Pixels | Configuração obtida no servidor, deduplicação e logs | IDs/tokens de sandbox de cada plataforma |
| MinIO | Namespace/autorização corrigidos | Endpoint, bucket, access key e secret key válidos |

Sem essas credenciais, afirmar que a integração “funciona completamente” seria incorreto. O código, autorização e contratos estão preparados; o teste externo de entrega depende do provedor real.

## Dependências do proprietário

### Críticas antes de produção

1. **Rotacionar imediatamente a secret key do Supabase e a senha do Postgres que foram compartilhadas durante a migração.** A publishable key é pública por desenho; a secret key e a senha não são.
2. Fornecer/configurar credenciais e sandboxes listados na matriz de integrações.
3. Definir hospedagem, domínio, DNS e URLs permitidas de pixel/OAuth.
4. Escolher o plano de backup: PITR do Supabase ou dump diário criptografado com teste de restauração.
5. Definir ferramenta de observabilidade e destinatários dos alertas.
6. Aprovar política de retenção e privacidade para respostas, IP/geo, documentos e dados de leads.

### Decisões de negócio

- SLA/SLO de disponibilidade e latência.
- Retenção de respostas e direito de exclusão/LGPD.
- Limite de upload por formulário e tipos de arquivo aceitos.
- Política de reprocessamento: quais integrações podem repetir uma entrega e como deduplicar no destino.
- Domínios externos permitidos para webhooks em produção.

## Riscos residuais priorizados

| Prioridade | Risco | Tratamento |
|---|---|---|
| P1 | Sem observabilidade central e alertas de erro/latência | Configurar Sentry/telemetria e alertas antes do go-live |
| P1 | Integrações ainda sem ensaio real | Testar uma entrega positiva, negativa, timeout e retry por provedor |
| P1 | Segredos fornecidos durante migração ainda precisam de rotação | Rotacionar e atualizar somente ambientes autorizados |
| P1 | Backup/restauração sem prova documentada | Executar restore drill antes de dados reais |
| P3 | 11 warnings de lint restantes, todos da regra de organização de exports do Fast Refresh | Separar exports em arquivos próprios durante manutenção; não afetam o build nem o runtime de produção |
| P2 | Credenciais de integração permanecem em JSON protegido por RLS, visíveis a admins | Evoluir para função de configuração que retorna valores mascarados ou Vault |
| P2 | Bloqueio SSRF por hostname não elimina DNS rebinding | Adotar allowlist de domínios ou proxy de egress controlado |
| P2 | Ausência de teste de carga representativo | Rodar k6/Artillery no staging com volumes acordados |
| P3 | Migração para React 19/novo stack | Só avaliar após produção estável e com benefício medido |

## Plano de liberação

### Fase A — concluída

- Migração para repositório e Supabase novos.
- Schema/migrações, autorização e Edge Functions.
- Correções P0/P1 descritas acima.
- Matriz automatizada de elementos, persistência real e build.
- 156 testes automatizados aprovados, typecheck aprovado, build aprovado, zero vulnerabilidades no `npm audit` e schema remoto sem erros no lint.

### Fase B — exige entradas do proprietário

- Rotação de segredos.
- Configuração e teste real das integrações.
- Hosting/CDN, domínio e variáveis de produção.
- Backup, privacidade e observabilidade.

### Fase C — homologação

- E2E completo por tipo de campo e por caminho condicional.
- Rede móvel lenta e dispositivo físico de baixa capacidade.
- WCAG 2.2 AA e temas de alto/baixo contraste.
- Carga, timeout, retries, idempotência e recuperação de integração.
- Restore drill do banco.

### Fase D — go-live controlado

- Deploy imutável com rollback.
- Smoke test de leitura, submissão, persistência e painel.
- Monitoramento reforçado nas primeiras 24 horas.
- Revisão de métricas e incidentes em 24 h e 7 dias.

## Critério final de GO

Produção recebe **GO** somente quando todos os itens forem verdadeiros:

- Testes, typecheck, lint sem erros e build passam no commit publicado.
- Segredos expostos na migração foram rotacionados.
- Backup e restauração foram comprovados.
- Cada integração habilitada passou em happy path, falha e timeout.
- Domínio publicado passou em navegação móvel lenta, acessibilidade e persistência.
- Alertas e responsáveis operacionais estão definidos.
- Existe rollback ensaiado para frontend e funções.
