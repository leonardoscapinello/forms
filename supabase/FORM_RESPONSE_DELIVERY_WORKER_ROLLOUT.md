# Rollout do worker de entregas de respostas

O worker consome `form_response_deliveries` no servidor, recupera a resposta
canônica em `form_responses`, descriptografa `answers`/`metadata` e tenta
novamente Google Sheets e o webhook de conclusão. O navegador não participa dos
retries.

## Ordem de implantação

1. Aplique as migrations, incluindo:
   - `20260810201500_idempotent_response_completion_deliveries.sql`
   - `20260810214000_durable_form_response_delivery_outbox.sql`
   - `20260810223000_schedule_response_delivery_worker.sql`
   - `20260810224000_explicit_least_privilege_grants.sql`
   - `20260810232000_google_sheets_sync_fencing.sql`
2. Cadastre um segredo aleatório de pelo menos 32 bytes com o nome
   `DELIVERY_WORKER_SECRET` em **Edge Functions > Secrets** no Dashboard.
3. Faça deploy das duas funções que compartilham a implementação de entrega:

   ```sh
   supabase functions deploy form-public-save
   supabase functions deploy form-response-delivery-worker --no-verify-jwt
   ```

4. Em **Database > Vault**, crie:
   - `project_url`: URL padrão `https://<project-ref>.supabase.co` (a função
     remove barra final e rejeita URL fora de HTTPS/Supabase);
   - `delivery_worker_secret`: exatamente o mesmo valor cadastrado como
     `DELIVERY_WORKER_SECRET` nas Edge Functions.
5. A migration `20260810223000_schedule_response_delivery_worker.sql` habilita
   **Cron** e **pg_net** e instala uma função de configuração idempotente.
6. Depois de cadastrar os dois segredos, agende o job sem repetir valores
   sensíveis no comando:

   ```sql
   SELECT public.configure_form_response_delivery_worker_schedule();
   ```

O agendamento não foi colocado em uma migration porque a URL e o segredo são
específicos de cada ambiente. Isso evita segredo literal no repositório, no
histórico de migrations e na definição do job.

O comando armazenado em `cron.job` contém somente subconsultas ao
`vault.decrypted_secrets`; nunca copie o valor do segredo para o SQL do job.

## Verificação após o rollout

Confirme o agendamento e as execuções:

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'form-response-delivery-worker';

SELECT status, count(*)
FROM public.form_response_deliveries
GROUP BY status
ORDER BY status;

SELECT id, form_id, response_id, delivery_type, attempts, last_error,
       next_attempt_at, dead_lettered_at
FROM public.form_response_deliveries
WHERE status IN ('failed', 'dead_letter')
ORDER BY updated_at DESC
LIMIT 50;
```

Também confira **Edge Functions > Logs** e `cron.job_run_details`. Uma execução
saudável retorna HTTP 200 mesmo quando um item individual falha, pois o próprio
item já terá sido reagendado com backoff ou movido para `dead_letter`.

## Operação

- Lease do worker: 120 segundos.
- Concorrência por invocação: 5.
- Agendamento: a cada 10 segundos; lote agendado de 10 itens.
- Capacidade nominal pelo agendamento: até 60 entregas/minuto (por exemplo,
  aproximadamente 30 leads/minuto quando cada lead gera Sheets + webhook),
  sujeita à latência e aos limites dos provedores.
- Lote padrão em chamada manual: 10; máximo: 10. O corpo autenticado é limitado
  a 1 KiB; corpo vazio de cron equivale ao lote padrão.
- Sincronização manual do Google Sheets: lease exclusivo de 120 segundos,
  renovado antes de cada escrita/limpeza e limitado no banco ao intervalo de
  30–300 segundos. O token de fencing impede uma execução vencida de renovar
  ou liberar o lease adquirido por outra execução.
- Enquanto o lease manual do Sheets estiver ativo, a consulta de claim não
  seleciona entregas daquele destino; o worker também repete essa verificação
  imediatamente antes do I/O para fechar a corrida claim × sync. Expirado ou
  liberado o lease, o worker retoma automaticamente os itens pendentes.
- Leases por item e tokens de fencing impedem duas invocações do worker de
  confirmar a mesma entrega.
- Tentativas máximas: 8.
- Backoff: exponencial com jitter, começando entre 15–30 segundos e limitado a
  30–60 minutos.
- Itens `dead_letter` exigem correção da causa antes de replay manual.

Antes de um replay, confirme que o destino aceita a chave de idempotência do
webhook ou que a linha da planilha já pode ser atualizada pelo `response_id`.
