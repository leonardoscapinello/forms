# ADR 001 — renderização híbrida e caminho para SSR

- Estado: **aceito para a release de estabilização; reavaliar com métricas de produção**
- Data: 10/08/2026
- Escopo: editor administrativo e formulário público

## Decisão

Esta release não fará uma reescrita integral de framework. O produto seguirá uma arquitetura híbrida:

1. o editor administrativo continua como aplicação React interativa, com divisão por rota;
2. `/f/:id` passa por uma Vercel Function que entrega no HTML inicial SEO, identidade e a primeira tela cacheável do formulário;
3. o runtime público baixa o contrato completo, valida a disponibilidade atual e substitui o shell somente quando estiver pronto;
4. tokens de submissão, respostas, condições, integrações e efeitos externos continuam exclusivamente no runtime autenticado/Edge, nunca no HTML cacheável;
5. uma migração para React Router Framework Mode ou Vite + Nitro só será aprovada depois de um spike isolado e um benchmark com a mesma fixture.

A antiga função `form-ssr-generate`, que gravava outro artefato HTML em Storage,
não participa desse caminho e permanece bloqueada com HTTP 410. Ela só pode ser
reativada por uma decisão operacional explícita (`ENABLE_LEGACY_FORM_SSR_GENERATE=true`),
após revisão própria; o deploy normal deixa a variável ausente.

## Motivo

O problema de produção não é apenas “ser SPA”. Segurança e perda de leads dependem de autorização, RLS, ACK explícito, idempotência, persistência canônica, fila transacional e observabilidade no servidor. Trocar o framework durante o mesmo ciclo em que esses contratos são endurecidos ampliaria o raio de regressão.

A solução atual captura os benefícios imediatos de servidor — conteúdo inicial, metatags sociais, cache CDN e erro HTTP apropriado — sem reescrever o canvas e o Workflow. Ela não é apresentada como hidratação React completa: o primeiro shell é seguro e descartável, e o runtime permanece a fonte de verdade.

## Opções avaliadas

| Opção | Benefício | Custo/risco agora | Decisão |
|---|---|---|---|
| SPA sem servidor | Menor mudança | HTML vazio, SEO/social e primeira pintura piores | Rejeitada para `/f/:id` |
| Shell server-rendered + runtime atual | Ganho imediato, migração pequena e reversível | Ainda baixa JS para interagir | **Adotada nesta release** |
| React Router Framework Mode | SSR, route modules, loaders e code splitting oficiais | Migração das rotas, entradas e contratos de browser; exige spike | Candidata preferencial |
| Vite + Nitro | SSR/API integrados ao Vite e Vercel Functions | Nova camada de runtime e operação | Candidata alternativa |
| Reescrita em outro framework | Possível SSR completo | Maior risco, prazo e superfície de regressão | Rejeitada sem evidência |

## Gate para SSR React completo

O spike deve implementar apenas um formulário de referência e comprovar:

- TTFB, LCP, INP, CLS e bytes de JavaScript em cache frio/quente;
- render no servidor e hidratação sem criar sessão, evento, autosave ou submissão duplicados;
- preview administrativo sem persistência e sem herdar autenticação;
- compatibilidade de todos os elementos que usam `window`, canvas, upload, mídia ou bibliotecas lazy;
- CSP com nonce quando o runtime gerar scripts inline;
- deploy, rollback, logs, custo e região de execução na Vercel;
- melhoria estatisticamente relevante frente ao shell híbrido atual.

Sem melhora mensurável ou com regressão funcional, o shell híbrido permanece. O editor só migra para SSR se uma métrica real de sua jornada justificar o custo; canvas e Workflow continuarão dependentes de hidratação no navegador.

## Rollback

As rotas administrativas continuam servidas pelo fallback estático. Para o formulário público, o rollback consiste em remover a rewrite específica de `/f/:id` e restaurar o fallback para `index.html`; nenhuma migration de banco depende do modo de renderização.

## Referências oficiais

- React Router — modos e estratégias: https://reactrouter.com/start/modes
- React Router — adoção incremental do Framework Mode: https://reactrouter.com/upgrading/router-provider
- React Router — SSR e pré-renderização: https://reactrouter.com/start/framework/rendering
- Vite — SSR: https://vite.dev/guide/ssr
- Vercel — Vite, Functions e SSR: https://vercel.com/docs/frameworks/frontend/vite
- Vercel — Vite + Nitro: https://vercel.com/docs/frameworks/full-stack/vite-with-nitro
