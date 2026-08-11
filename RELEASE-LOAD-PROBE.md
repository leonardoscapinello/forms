# Probe de carga e smoke da release

O script `scripts/release-load-probe.mjs` executa um teste HTTP curto, repetível e somente leitura contra um formulário já publicado ou fechado. Ele cobre:

- `GET` e `HEAD` do shell público `/f/:id`;
- `GET` e `HEAD` da imagem `/api/form-og`;
- `GET` e `HEAD` da Edge Function `form-public-metadata`;
- `GET` da Edge Function `form-public-get`.

`form-public-get` não oferece `HEAD`; testar esse método geraria um erro artificial. Seu `GET` cria apenas IDs e um token transitórios na resposta, sem inserir sessão, resposta, analytics, pixel, webhook ou lead. O probe nunca usa POST e não executa o JavaScript do formulário.

## Execução completa

Use uma chave pública por variável de ambiente para que ela não fique no histórico do shell:

```sh
export RELEASE_PROBE_SUPABASE_KEY="CHAVE_PUBLICA"

npm run probe:release -- \
  --base-url https://forms.example.com \
  --supabase-url https://project-ref.supabase.co \
  --form-id 00000000-0000-4000-8000-000000000000 \
  --requests 10 \
  --concurrency 2
```

Os padrões aplicados a cada cenário são: 10 amostras, concorrência 2, um aquecimento excluído das métricas, timeout de 8 s, taxa de erro máxima de 0%, p95 de 2 s e p99 de 4 s. Todos podem ser sobrescritos; use `node scripts/release-load-probe.mjs --help` para ver as opções e variáveis de ambiente.

Para saída consumível por CI:

```sh
npm run probe:release -- \
  --base-url https://forms.example.com \
  --supabase-url https://project-ref.supabase.co \
  --form-id 00000000-0000-4000-8000-000000000000 \
  --json > release-probe.json
```

O código de saída é `0` quando todos os cenários respeitam os budgets, `1` quando algum cenário falha e `2` para configuração inválida. A chave pública nunca é incluída no relatório.

## Execução local focada

O Vite local não serve as funções server-side da Vercel. Para verificar somente o shell sem tráfego no Supabase:

```sh
npm run probe:release -- \
  --base-url http://127.0.0.1:8080 \
  --form-id 00000000-0000-4000-8000-000000000000 \
  --targets shell \
  --requests 3 \
  --concurrency 1
```

Os testes unitários do cálculo usam apenas o test runner nativo do Node:

```sh
npm run test:probe
```

## Como interpretar

- p50, p95 e p99 usam nearest-rank e consideram somente respostas válidas e bem-sucedidas.
- A taxa de erro considera todas as tentativas, incluindo timeout, falha de rede, status diferente de 200, `Content-Type` incorreto, HTML/imagem vazios e JSON cujo ID não corresponde ao formulário.
- Os budgets são avaliados por cenário para impedir que um endpoint rápido esconda outro lento.
- Aquecimentos reduzem a distorção de cold start. Use `--warmup 0` quando o objetivo for medir explicitamente o primeiro acesso.

Este é um probe controlado, não um teste de capacidade ilimitada. Aumentar amostras ou concorrência pode acionar os limites de 120 leituras/minuto do metadata e 60 leituras/minuto do public-get; o script avisa quando o plano se aproxima deles. Ele também não substitui E2E em navegador, auditoria de banco, validação de integrações externas nem teste de carga distribuído com autorização operacional.
