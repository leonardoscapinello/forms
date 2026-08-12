# Runbook de produção — Forms

> Responsável: Leonardo Scapinello
> Snapshot operacional atualizado em: 11/08/2026
> Regra operacional: uma integração pode atrasar, mas a resposta canônica não
> pode desaparecer nem ser anunciada como concluída sem ACK do servidor.

## 0. Estado conhecido do snapshot publicado

- URL pública canônica: `https://pulse.leonardoscapinello.com`.
- Vercel: equipe `twobrainbr`, projeto `forms` (`prj_NJzp69LXGU9sWNE3EyGZdoqb4mdY`).
- Supabase: `gxotayvavefhlcvbuczq`, com 48 migrations alinhadas, Edge Functions da release publicadas, Vault configurado e worker periódico ativo a cada 10 segundos.
- Banco limpo de referência: 159 testes pgTAP aprovados em PostgreSQL 15.
- Aplicação: snapshot final aprovado com 78 arquivos / 601 testes Vitest, TypeScript, ESLint, build/orçamento de bundle, 25 Edge Functions no `deno check`, 83 testes Deno e `npm audit --omit=dev` com 0 vulnerabilidades.
- Primeiro paint público: `/f/:id` deve exibir somente o loader vetorial da marca até dados, fluxo inicial e módulos da primeira tela estarem prontos; título, campos e CTA provisórios são regressão bloqueante.
- Produção: alias customizado público em estado saudável; probe read-only 70/70, erro 0% e p95 agregado 500,44 ms.
- Entrega contínua: pushes em `main` só publicam após `verify`, `edge-functions` e `database`; o job usa o ambiente GitHub `production`, permitido somente para `main`, uma credencial dedicada ao CI com rotação até 12/08/2027 e IDs fixos da equipe/projeto. A prova publicada é o run `31548453868`, commit `c19a7d7`, implantação `dpl_2Ua5Mnq1TXgaHxF713dPvpyZwLU2`, estado `READY` no domínio canônico.
- Fonte do deploy: o GitHub Actions é o único mecanismo automático ativo. A conexão Git nativa da Vercel permanece `link: null` porque a identidade GitHub vinculada à sessão da Vercel não é a proprietária de `leonardoscapinello/forms`; não habilite os dois mecanismos em paralelo.
- E2E real: condição/A-B, variável pré-populada, analytics não configurado e página terminal vazia chegaram à tela de obrigado; a resposta canônica ficou concluída e criptografada.
- Preview: desktop/tablet/celular exercitados; a prova permaneceu 25 → 25. A limpeza posterior de fixtures históricas deixou 23 respostas (8 completas/15 parciais), todas criptografadas, e 0 sessões de preview.
- Dumps pré-release preservados fora do repositório: `/tmp/forms-production-pre-release-schema-20260811.sql` e `/tmp/forms-production-pre-release-data-20260811.sql`. Arquivos em `/tmp` não substituem backup/PITR durável.
- Analytics: a visão por página conserva uma coluna por resposta e cria uma linha superior agrupada por `colSpan`/`scope="colgroup"`, equivalente à célula mesclada de planilha.
- Integração ativa: Reoon validada server-side e armazenada mascarada/criptografada. Demais conectores sem credencial permanecem desativados.

Este bloco registra o snapshot tecnicamente aprovado; não substitui monitoramento contínuo, certificações operacionais nem os gates de cada integração habilitada. Atualize-o somente com evidência reproduzível e nunca inclua segredo ou PII.

## 0.1. Bootstrap protegido do primeiro administrador

Este procedimento existe apenas para uma instalação nova. Não o habilite na
produção atual, que já possui usuários.

1. Confirme, por uma consulta administrativa, que Supabase Auth, `profiles` e
   `user_roles` estão vazios. Qualquer erro ou contagem desconhecida bloqueia o
   bootstrap.
2. Gere um token forte fora do shell history, logs e repositório.
3. Cadastre `SETUP_TOKEN` e `SETUP_ENABLED=true` exclusivamente em Edge Secrets;
   nunca use variável `VITE_*` nem variável da Vercel para esses valores.
4. Abra `/login`, crie a primeira conta e confirme o login e o papel de
   administrador.
5. Imediatamente defina `SETUP_ENABLED=false`, remova ou rotacione
   `SETUP_TOKEN` e confirme que `setup-admin` responde
   `setupRequired: false` à ação `status`.

A Edge aceita somente `POST`, limita o corpo a 4 KB, aplica rate limit e exige
o token temporário para criar. O banco concede um único claim de cinco minutos,
todo usuário nasce com papel `user` e a função só responde sucesso depois de
promover o ID exato, confirmar o papel `admin` e concluir o claim. Falha de
promoção executa rollback confirmado; ACK incerto falha fechado para revisão
manual. O status público não retorna contagens, e-mail, token ou qualquer PII.

## 1. SLOs e alertas mínimos

| Sinal | Objetivo | Alerta |
|---|---:|---:|
| disponibilidade de `/f/:id` | 99,9% | 2 falhas consecutivas em regiões diferentes |
| persistência canônica p95 | ≤ 1,2 s | p95 > 2 s por 10 min |
| erro de conclusão | < 0,1% | qualquer janela de 5 min acima de 1% |
| idade do item mais antigo no outbox | < 60 s | > 2 min; crítico > 10 min |
| dead-letter novo | 0 | qualquer item |
| p95 do HTML público aquecido | ≤ 500 ms | > 1 s por 10 min |

O monitor deve usar um formulário sintético separado. Nunca reutilize dados de
cliente em probes. O script read-only está em `scripts/release-load-probe.mjs`.

## 2. Primeiros cinco minutos de um incidente

1. Não edite nem apague respostas.
2. Registre horário UTC, release SHA, formulário, região Vercel e o ID de
   correlação/`response_id`, sem copiar respostas, e-mail ou telefone.
3. Confirme se o HTML público responde e se a Edge `form-public-get` devolve o
   formulário correto.
4. Confira backlog e dead-letter com as consultas abaixo.
5. Se a persistência canônica estiver falhando, pause campanhas externas ou
   feche somente os formulários afetados com uma mensagem clara. Não desligue o
   banco nem faça rollback destrutivo.
6. Se apenas um provedor externo estiver indisponível, mantenha o formulário no
   ar: o outbox é a fronteira de durabilidade e fará retry.

Consultas de diagnóstico sem PII:

```sql
select status, count(*) as items,
       min(created_at) as oldest_created_at,
       max(attempts) as max_attempts
from public.form_response_deliveries
group by status
order by status;

select delivery_type, status, count(*) as items,
       min(next_attempt_at) as next_attempt_at
from public.form_response_deliveries
where status <> 'delivered'
group by delivery_type, status
order by delivery_type, status;

select jobid, jobname, schedule, active
from cron.job
where jobname = 'form-response-delivery-worker';

select status, count(*)
from cron.job_run_details
where jobid in (
  select jobid from cron.job where jobname = 'form-response-delivery-worker'
)
  and start_time >= now() - interval '1 hour'
group by status;
```

## 3. Outbox, retry e dead-letter

- O navegador recebe sucesso depois da resposta canônica e dos jobs exigidos
  estarem duráveis; ele não espera Google Sheets ou webhook.
- O worker usa lease e fencing token. Nunca execute duas alterações manuais no
  mesmo item sem `FOR UPDATE`.
- Antes de replay, corrija o destino e confirme que ele aceita a chave de
  idempotência/`response_id`.
- Faça replay somente de IDs exatos, em transação, e guarde a saída do
  `RETURNING` no registro do incidente.

Nós de analytics sem configuração não bloqueiam o lead: a tentativa deve ser
registrada como `skipped`/`failed`, com prova assinada de workflow, e o fluxo
continua. Não converta webhook, IA ou imagem externa em variável autoritativa
sem persistir o resultado canônico; na ausência desse traço, o comportamento
correto é fail-closed.

Modelo de replay autorizado, executado por `service_role`/DBA:

```sql
begin;

select id, form_id, response_id, delivery_type, status, attempts, last_error
from public.form_response_deliveries
where id = '<DELIVERY_UUID>'
for update;

update public.form_response_deliveries
set status = 'failed', attempts = 0, lease_until = null, lease_token = null,
    next_attempt_at = now(), dead_lettered_at = null, last_error = null,
    updated_at = now()
where id = '<DELIVERY_UUID>' and status = 'dead_letter'
returning id, form_id, response_id, delivery_type, status;

commit;
```

Zero linhas no `RETURNING` significa “não confirmado”; não repita no escuro.

## 4. Rollback

### Frontend/Vercel

1. Identifique a última implantação aprovada e o SHA correspondente.
2. Promova essa implantação pelo painel Vercel ou redeploye exatamente o SHA.
3. Valide login, `/f/:id`, HTML/OG, preview sem persistência e uma resposta QA.
4. Não reutilize um bundle antigo com migrations/funções incompatíveis.

O caminho normal de entrega é o job `deploy-production` de `.github/workflows/ci.yml`.
Ele usa o artefato do mesmo SHA que passou nos três gates e serializa publicações
com `concurrency: vercel-production`. Não execute um deploy manual em paralelo.
Se o token expirar ou for revogado, crie outro dedicado ao CI no escopo mínimo
aceito pela Vercel para a equipe `twobrainbr`; os IDs fixos do workflow continuam
limitando o destino ao projeto `forms`. Substitua somente o segredo
`VERCEL_TOKEN` do ambiente `production` e revogue o anterior depois de um deploy
aprovado.

### Edge Functions

Redeploye as funções a partir do SHA aprovado e respeite `supabase/config.toml`.
`form-response-delivery-worker`, `form-public-save` e o schema do outbox devem
permanecer compatíveis. Nunca use `--prune` durante um incidente.

### Banco

As migrations desta release são forward-only. Não remova coluna/tabela nem
edite o histórico aplicado. Em caso de defeito, publique uma migration corretiva.
Para corrupção de dados, restaure o backup em um projeto isolado, valide e faça
uma recuperação seletiva; não sobrescreva produção sem uma janela aprovada.

## 5. Rotação de segredos

1. Gere o novo valor fora de logs/histórico.
2. Cadastre-o em Edge Secrets (`supabase secrets set NOME=...`).
3. Quando houver par no Vault, atualize a mesma versão antes de revogar a antiga.
4. Reimplante somente as funções que consomem o segredo.
5. Rode o teste real positivo, negativo e timeout da integração.
6. Revogue o valor anterior no provedor e registre data/responsável.

Para `DELIVERY_WORKER_SECRET`, Edge Secret e Vault
`delivery_worker_secret` precisam ser idênticos. Reexecute
`public.configure_form_response_delivery_worker_schedule()` depois da rotação.
Para Reoon e demais conectores, use a tela de integração: salvar só é confirmado
depois do teste do provedor; nunca cole a chave em issue, commit ou log.

`ENCRYPTION_SECRET` é obrigatório nas Edge Functions e protege, em envelope
AES-GCM versionado, as credenciais salvas em `integration_settings.config`.
Defina esse valor em Edge Secrets antes de publicar qualquer função produtora
ou consumidora de integrações; não o configure na Vercel nem em variável
`VITE_*`. A ausência, chave incorreta ou envelope adulterado interrompe a
operação de forma fechada. O `list` administrativo migra todas as linhas
legadas do tipo consultado com confirmação exata; para uma janela controlada,
use a ação administrativa `backfill-encryption` em lotes e avance somente pelo
`nextCursor` retornado, até `hasMore=false`. A resposta dessa ação contém apenas
contagens e cursor, nunca configuração ou segredo.

Não substitua `ENCRYPTION_SECRET` diretamente: envelopes existentes deixariam
de abrir. A rotação exige um procedimento explícito de recriptografia com a
chave anterior ainda disponível, validação de todas as integrações e somente
então revogação da chave antiga. Preserve a versão necessária para restore/PITR
pelo mesmo prazo dos backups, sob controle de acesso e auditoria.

## 6. Backup e restore drill

Antes de tráfego comercial:

1. confirme a política de backup/PITR do plano Supabase e retenção contratada;
2. restaure o ponto escolhido em projeto isolado;
3. aplique o SHA da aplicação correspondente;
4. execute lint do banco, pgTAP, contagens por tabela e amostras sintéticas;
5. valide decriptação usando o segredo da versão correta, sem exportar PII;
6. execute uma conclusão QA e um ciclo do worker;
7. documente RTO/RPO observado e elimine o ambiente isolado conforme a política
   de retenção.

Um `db reset` local comprova migrations, não substitui restore de backup real.

## 7. Logs e privacidade

Pode registrar: release SHA, função, status, duração, `form_id`, `response_id`,
node key, delivery ID, tentativa e código de erro sanitizado.

Não pode registrar: respostas, corpo de webhook, tokens, API keys, e-mail,
telefone, documento, endereço, cookies ou headers de autorização. Em suporte,
prefira hashes/IDs e limite o acesso pelo menor tempo necessário.

## 8. Gate de go-live

- suíte, typecheck, lint, build, bundle budget, Deno e pgTAP aprovados;
- migrations e funções remotas no mesmo SHA;
- cron ativo, Vault configurado e worker saudável;
- preview em desktop/tablet/mobile com zero alteração de contagem no banco;
- uma resposta QA completa aparece uma única vez no painel;
- partial atrasado não altera a resposta concluída;
- HTML inicial contém título, descrição, canonical, OG/Twitter e thumbnail 1200×630;
- cada integração ativa passa sucesso, credencial inválida e timeout; as demais
  permanecem desativadas;
- probe read-only dentro dos budgets;
- rollback e restore drill com responsáveis definidos.

### Situação desta release

- Já comprovado: deploy no projeto Vercel `twobrainbr/forms`, domínio customizado,
  Supabase, migrations, funções, cron/worker,
  HTML/OG/thumb, headers, Reoon, E2E concluído e preview responsivo sem insert.
- Higiene de fixtures: três sessões históricas `editorPreview`, duas respostas e
  oito page events sintéticos foram removidos atomicamente; não havia pixel,
  workflow ou delivery associado. Estado final: 23 respostas, 0 sessões preview.
- Gate final confirmado: `npm run verify`, toda a suíte Deno, 159 pgTAP, audit
  de dependências, probe 70/70, migrations remotas, Auth e deployment Vercel.
- Aguardando entrada externa: credenciais/sandboxes dos conectores desativados,
  proteção HIBP caso haja upgrade do Supabase e qualquer endpoint necessário
  para liberar resultados externos hoje mantidos fail-closed.
- Certificações operacionais separadas: carga/soak, RUM prolongado, WCAG formal
  em dispositivo físico e restore drill com RPO/RTO acordados. Não registrar
  esses itens como concluídos sem o ensaio correspondente.
