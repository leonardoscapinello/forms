# Plano-mestre de conclusão e produção — Forms

> Proprietário: Leonardo Scapinello
> Atualizado em: 11/08/2026
> Repositório: `leonardoscapinello/forms`
> Produção-alvo: Vercel `twobrainbr/forms` + Supabase, no domínio `pulse.leonardoscapinello.com`, sem dependência do Lovable
> Estado geral: **GO TÉCNICO DA RELEASE — produção publicada e rodada integrada final aprovada**

Este é o checklist operacional único dos pedidos feitos nesta sequência de trabalho. Um item só recebe **CONCLUÍDO** quando a implementação e o teste proporcional ao risco já passaram. A aprovação global abaixo foi concedida após suíte completa, validação das migrations, smoke test no domínio publicado e conferência dos dados persistidos.

## Legenda

| Símbolo | Estado | Significado |
|---|---|---|
| ✅ | CONCLUÍDO | Implementado e com evidência de teste já aprovada |
| 🧪 | HOMOLOGAÇÃO | Implementado; falta a regressão final integrada ou em produção |
| 🚧 | EM EXECUÇÃO | Alteração sendo implementada/revisada agora |
| ⏳ | AGUARDANDO | Depende de credencial, conta, endpoint ou decisão externa ao código |
| ⚠️ | BLOQUEIO EXTERNO | Depende de plano/conta/credencial que o código não consegue criar |
| 📋 | BACKLOG | Evolução posterior, certificação ampliada ou comparação de produto; não é falha aberta desta release |

## Snapshot verificável da release em produção

Este snapshot registra o que já foi comprovado sem antecipar a aprovação final:

| Estado | Evidência em 11/08/2026 |
|---|---|
| ✅ | Vercel publicada no projeto correto `twobrainbr/forms`, com `https://pulse.leonardoscapinello.com` como domínio público; DNS Cloudflare, TLS e acesso público pelo domínio customizado foram confirmados |
| ✅ | Supabase `gxotayvavefhlcvbuczq` atualizado: **48 migrations** aplicadas do zero em PostgreSQL 15 no ensaio limpo, **159 testes pgTAP**, migrations remotas alinhadas, **25 Edge Functions** verificadas e worker periódico ativo |
| ✅ | Snapshot final aprovado: **78 arquivos / 601 testes Vitest**, typecheck, ESLint, build e orçamento de bundle; **25 Edge Functions** no `deno check` e **83 testes Deno** |
| ✅ | CI e deploy automático finais aprovados no run [`31548453868`](https://github.com/leonardoscapinello/forms/actions/runs/31548453868): o commit `c19a7d7` passou por verificação web, auditoria de dependências, Edge Functions, migrations limpas e pgTAP antes de gerar a implantação Vercel `dpl_2Ua5Mnq1TXgaHxF713dPvpyZwLU2`, em estado `READY` no domínio canônico |
| ✅ | E2E publicado concluiu um fluxo real com condição/A-B, variável pré-populada, analytics não configurado tratado sem perder lead e página terminal vazia; resposta canônica ficou concluída e criptografada |
| ✅ | Preview publicado validado em desktop, tablet e celular; durante a prova a contagem permaneceu **25 → 25**, sem novo efeito persistido. Depois, uma limpeza atômica removeu somente fixtures históricas de preview e deixou o banco em **23 respostas**, sem sessão de preview |
| ✅ | Reoon foi salvo pelo servidor, testado no provedor, marcado ativo e mantido mascarado/criptografado |
| ✅ | Analytics “Por página” mantém as respostas em colunas individuais e adiciona acima delas um cabeçalho por página com `colSpan`/`scope="colgroup"`, como uma célula mesclada do Excel |
| ✅ | `npm run verify`, Deno completo, `npm audit --omit=dev`, lint remoto, dry-run de migrations e diff check passaram; probe read-only de produção aprovou **70/70** requisições, erro 0% e p95 agregado de **500,44 ms** |
| ✅ | Cadastro público por e-mail, telefone, OAuth e modo anônimo está desativado; o primeiro administrador usa claim atômico, token temporário, promoção com ACK e rollback seguro. Em produção `setupRequired` responde `false` |
| ⏳ | Integrações sem credencial/sandbox real continuam desativadas. Resultados produzidos apenas por webhook/IA/imagem externa permanecem fail-closed até existir traço canônico persistido e autorizado |

## 1. Ambiente, propriedade e identidade

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Identificar o último commit-base | `b5f53a5 feat: apply FH Duo black brand system` registrado |
| ✅ | Subir e manter o servidor local | Aplicação acessível em `127.0.0.1:8080` |
| ✅ | Corrigir `supabaseUrl is required` | Variáveis locais e Vercel configuradas; cliente inicia corretamente |
| ✅ | Autenticação administrativa funcional | Login autenticado e painel acessível |
| 🧪 | Recuperação autônoma de senha | Solicitação neutra por e-mail e tela de nova senha com mínimo de 12 caracteres implementadas; falta homologar callback no domínio publicado |
| ✅ | Elevar senha mínima | Supabase configurado com mínimo de 12 caracteres |
| ⚠️ | Proteção de senha vazada/HIBP | Recurso recusado pelo Supabase por exigir plano Pro; não bloqueará o restante sem decisão de plano |
| ✅ | Remover vínculo técnico com Lovable | Integração, dependência e arquivos Lovable removidos; o GitHub App `lovable.dev` foi restringido aos outros 45 repositórios atuais e não tem mais acesso ao `forms` |
| ✅ | Confirmar ausência total de referências Lovable | Código, pacote e runtime não contêm Lovable; a configuração do GitHub também exclui explicitamente este repositório |
| ✅ | Rebranding pessoal | Autor, título-base, ícones e copyright Leonardo Scapinello aplicados |
| ✅ | Permitir editar o nome do sistema | Persistência global, tela Geral e consumo no login/sidebar publicados; migration aplicada |
| ✅ | Permitir editar proprietário e descrição do sistema | Configuração global publicada e propagada também para SEO/thumbnail |

## 2. Lista inicial, layout e navegação administrativa

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| 🧪 | Centralizar/alinha corretamente os cards e a linha dos formulários na Home | Regressão visual desktop/mobile pendente |
| 🧪 | Corrigir estados de hover/foco sem texto e fundo da mesma cor | Componentes base, preview, dropdowns, nós e botões corrigidos; varredura visual final pendente |
| 🧪 | Corrigir botão fechar do preview e ações dos pop-ups | Testes de contraste passaram; validar todas as modais no build final |
| 🧪 | Corrigir ação preta sobre fundo preto no nó Condição | Classes do nó e componentes base corrigidas; validar no canvas real |
| ✅ | Melhorar aparência do menu “Adicionar bloco” do Workflow | Categorias, descrições e busca por finalidade/sinônimos implementadas e validadas no navegador |
| 🧪 | Refinar visual e consistência das sidebars do construtor | Elementos, estrutura de páginas e menu do workflow refeitos; resta varredura responsiva integrada de toda a ferramenta |
| ✅ | Exigir cor sólida também no modo de fundo por imagem | Cor persistida e renderizada atrás da imagem no editor, preview e publicado |
| 🧪 | Homologar fundo por imagem em rede lenta/erro | Comportamento implementado; cenário de rede degradada será repetido na rodada integrada final |

### 2.1. Linguagem e sidebar de personalização dos elementos

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| 🧪 | Revisar os textos da ferramenta inteira | Jargão, labels e descrições críticas foram reescritos; varredura final integrada continua como gate de UX |
| ✅ | Criar um glossário consistente | Ações centrais usam os mesmos nomes em construtor, workflow, preview, respostas e configurações |
| ✅ | Explicar controles no contexto | Controles reorganizados com descrições que explicam o efeito da configuração |
| ✅ | Reorganizar sidebar direita por tipo de elemento | Controles condicionais em Conteúdo → Comportamento → Aparência → Espaçamento e posição → Avançado |
| ✅ | Padronizar seções da sidebar | Ordem, ícones, descrições e densidade implementados |
| ✅ | Tornar “Aparência” funcional em todos os elementos compatíveis | Editor e runtime usam as propriedades persistidas de aparência, borda, sombra e largura |
| ✅ | Renomear/explicar “Exterior” | Substituído por “Espaçamento e posição”, com controles contextualizados |
| ✅ | Corrigir controles de alinhamento | Ícones, seleção e descrição do objeto alinhado refeitos |
| ✅ | Corrigir cor de texto padrão | Herança do tema diferenciada da sobrescrita local |
| ✅ | Melhorar tabs, ícones, espaçamento e respiro | Recuos, ícones e densidade revisados no painel do construtor |
| ✅ | Preservar consistência sem forçar campos iguais | Schema visual comum com controles somente quando compatíveis |
| 🧪 | Auditar todas as propriedades editáveis | Matriz de controles e persistência coberta por testes; conferência visual final do snapshot publicado permanece a confirmar |
| 🧪 | Testes de personalização por categoria | Texto, mídia, layout, campos, escolhas, rating, botões, conteúdo avançado e containers cobertos no runtime; repetir suíte completa final |
| 🧪 | Regressão visual da sidebar | Desktop/notebook foram exercitados; zoom, teclado e conteúdo longo permanecem na rodada visual final |

## 3. Campo de data

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Ordem de preenchimento configurável | Dia/mês/ano, mês/dia/ano e ano/mês/dia cobertos por testes |
| ✅ | Data de nascimento com ano primeiro sem impor isso a todas as datas | Configuração por campo implementada |
| ✅ | Ano inicial dinâmico | Atual, passado/futuro e deslocamento livre em anos/dias implementados |
| ✅ | Regras relativas ao dia corrente | Até hoje, a partir de hoje, antes/depois relativos e data livre implementados |
| ✅ | Limite por range de datas | Limites inicial/final e regras combinadas implementados |
| ✅ | Restrições que mudam com o passar do tempo | Cálculo relativo em runtime, sem data fixa “chumbada” |
| ✅ | Simplificar “Regras de seleção” | Editor dedicado e linguagem mais direta implementados |
| ✅ | Melhorar modal/calendário e aproveitar largura | Layout do seletor refeito e testado |
| 🧪 | Homologar todas as combinações no navegador | Testar virada de mês/ano, bissexto, mobile, teclado e limites antes do deploy |

## 4. Campos de escolha, avaliação e avanço automático

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Não avançar ao clicar no primeiro de vários campos clicáveis | Avanço só ocorre no último campo ainda não respondido |
| ✅ | Checkbox/múltipla seleção nunca autoavançar | Regra e testes implementados |
| ✅ | Página com um único campo clicável poder autoavançar | Mantido quando a interação realmente conclui a página |
| ✅ | Preview não persistir resposta parcial ou completa | Banco, sessão, evento, pixels e integrações isolados em preview; testes específicos |
| ✅ | Corrigir preview de rascunho que não carrega | Handshake com nonce, ACK do renderer e CORS de módulos no sandbox opaco implementados e testados |
| ✅ | Preview em desktop, tablet e celular | Troca responsiva validada no preview publicado nos três presets |
| ✅ | E2E “editar sem publicar → abrir preview → preencher” | A prova manteve 25 → 25; a contagem final posterior é 23 porque fixtures antigas, e não a execução atual, foram removidas atomicamente |
| ✅ | Trocar emojis fixos por ícones consistentes | Estrela, coração e curtida usam Lucide; emoji permanece apenas no modo personalizado |
| ✅ | Cores semânticas por avaliação | Estrela dourada, coração vermelho, curtida azul e numérico roxo |
| ✅ | Dar acabamento visual aos ratings | Preenchimento, fundo sutil, brilho/sombra e preview do editor implementados |
| 🧪 | Homologação visual dos ratings | Conferir claro/escuro, hover, teclado, mobile e customização de cor |

## 5. Telefone e DDI

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Corrigir contraste do seletor de DDI | Hover/foco com texto legível |
| ✅ | Trocar país e aplicar máscara correspondente | Remask BR/US e troca de país cobertos por teste |
| ✅ | Tornar máscara regra absoluta | Parcial, overflow ou formato incorreto bloqueiam avanço |
| ✅ | Campo opcional vazio continuar válido | Regra diferenciada entre vazio e preenchimento inválido |
| ✅ | Exibir erro acessível | Estado inválido e mensagem associada implementados |
| 🧪 | Homologar catálogo de países suportado | Percorrer máscaras e limites no navegador antes do deploy |

### 5.1. Feedback de validação e contenção do editor

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| 🧪 | Levar o usuário ao primeiro campo inválido | Scroll centralizado, foco programático e shake reiniciado passaram nos testes focados; falta E2E final |
| 🧪 | Tornar todo o campo inválido visualmente inequívoco | Título, numeração, linha/borda e foco permanecem vermelhos até a correção; falta regressão visual publicada |
| 🧪 | Respeitar teclado e movimento reduzido no feedback de erro | Foco acessível e fallback sem animação cobertos por testes; falta navegação real final |
| 🧪 | Conter a sidebar na largura disponível | Painel e conteúdo receberam limites de largura/overflow; falta regressão integrada em notebook, zoom 200% e conteúdo longo |

## 6. Workflow, condições e variáveis

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Avaliar condições a partir do início e entre páginas | Motor e testes revisados |
| ✅ | Resolver campos aninhados e labels de opções | Colunas, rádio, seleção e multisseleção cobertos |
| ✅ | Unificar operações de variável e interpolação no runtime | Resolutores frontend/Edge centralizados e usados por prepopulação, condições, matemática, conteúdo e integrações; suíte focada passou |
| ✅ | Pré-popular qualquer campo a partir de variável | Datas e campos simples/compostos resolvem a variável antes da normalização; E2E publicado exibiu o valor esperado |
| ✅ | Pré-popular a partir de campo, parâmetro GET e contexto | `field`, `param` e `ctx` são capturados antes dos defaults e cobertos por regressão |
| ✅ | Resolver defaults encadeados de forma segura | Ponto fixo com saída antecipada, cadeia longa e proteção contra ciclos cobertos por teste |
| ✅ | Garantir precedência de valores explícitos | Sobrescritas `__var_`, resposta atual, edição e retomada vencem defaults; geo tardio não sobrescreve valor tocado |
| ✅ | Usar o mesmo contrato em condições e matemática | Operandos, comparações, assignments e caminhos condicionais passaram na matriz focada |
| ✅ | Usar o mesmo contrato em conteúdo e integrações | Redirecionamento, e-mail HTML/texto, WhatsApp, IA, pixels e webhook usam o mesmo resolvedor e coleção informativa de variáveis |
| ✅ | Mapear resposta de webhook para variáveis | Dot paths e resposta completa implementados |
| ✅ | Nós de espera em série e reduced motion | Sem travar navegação/testes |
| ✅ | Idempotência de e-mail, WhatsApp, IA, pixels e webhook | Ledger server-side com lease/deduplicação e chave idempotente do Resend implementados; `processing` não vale como entrega concluída |
| ✅ | Retry do cliente para nós externos com falha transitória | Três tentativas, timeout/backoff, `fired` somente após ACK e erro visível que impede avanço |
| ✅ | Desativar ou endurecer `execute-workflow` legado | Retorna 410 por padrão e só pode ser reativado explicitamente; não será habilitado em produção |
| ✅ | Animar tela inicial → primeira página | Transição direcional e reduced motion implementados/testados |
| ✅ | Animar última página → página de obrigado | Mesmo contrato de tela animada implementado/testado |
| ✅ | Redirecionamento com qualquer campo/variável/contexto/parâmetro | Campos, variáveis, contexto, GET e webhook interpolados em destino seguro |
| ✅ | Preload do destino antes do redirecionamento | Destino estático antecipado; destino dinâmico somente depois do ACK para não vazar respostas |
| ✅ | Tornar claro onde configurar redirecionamento no Workflow | Nó End expõe “Obrigado / Redirecionar”; Jump e configurações compartilham o mesmo editor |
| ✅ | Aceitar página terminal alcançada pelo grafo | Rota determinística pode terminar em página persistida, inclusive vazia, sem exigir aresta inexistente; E2E publicado concluiu esse caminho |
| ✅ | Analytics não configurado não perder lead | Tentativa server-side gera telemetria `skipped`/`failed` e prova assinada, mas não bloqueia a conclusão; analytics nunca decide rota ou valor |
| ⏳ | Resultado de nó externo como variável | Webhook/IA/imagem continuam fail-closed quando o resultado não possui traço canônico persistido e autorizado; liberação depende do provedor/contrato real |
| 📋 | Comparar recursos oficiais de Typeform e Typebot | Backlog de produto após estabilizar os itens objetivos; não copiar complexidade sem critério |
| 📋 | Propor expansão de eventos, lógica e integrações | Backlog priorizado depende de decisão de produto antes de implementação adicional |

### 6.1. Valor inicial e pré-preenchimento universal

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Disponibilizar valor inicial em todo campo de preenchimento | Texto/nome, e-mail, telefone, textarea, números, data, escolhas, checkbox, rating/NPS, altura, peso e campos compostos usam o mesmo editor na seção Comportamento |
| ✅ | Escolher claramente a origem do valor | Editor separado em **Valor fixo**, **Variável** e **Parâmetro GET**, sem exigir que o construtor conheça a sintaxe interna |
| ✅ | Aceitar qualquer parâmetro GET autorizado | Chave customizada vira `{{param.chave}}`; parâmetros rastreados continuam disponíveis como atalhos e nomes reservados/perigosos são recusados |
| ✅ | Manter validação e formatação após resolver o valor | E-mail continua validado; telefone infere país/DDI, aplica a máscara correspondente e bloqueia incompleto ou overflow sem cortar dígitos |
| ✅ | Atualizar valor inicial quando a origem surge durante o fluxo | Campo anterior, assignment de página, variável de workflow e retorno de webhook são reavaliados na entrada e no retorno de página |
| ✅ | Preservar a precedência do respondente | Valor digitado, campo tocado vazio e resposta retomada nunca são sobrescritos por default, variável, contexto ou GET tardio |
| ✅ | Alertar sobre dados pessoais em URLs | Nome, e-mail e telefone exibem aviso de que o valor fica visível na URL/histórico e recomendam identificador opaco quando possível |
| ✅ | Regressão automatizada e visual | **68 testes focados**, suíte completa **78/601**, Edge **83/83**, `deno check` das 25 funções e inspeção local autenticada do painel passaram |

## 7. Persistência de leads, parciais e entregas externas

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Configurar “somente completas” ou “completas e parciais” | Opção respeitada pelo frontend e pela função de gravação |
| ✅ | Impedir partial atrasado de sobrescrever lead completo | Trigger imutável, upsert exato da Edge em pgTAP e corrida real em duas conexões PostgreSQL aprovados |
| ✅ | Exigir ACK explícito antes de retirar lead da fila local | HTTP 200 com HTML/JSON incompleto não confirma entrega; regressão automatizada cobre proxy e payload sem `success: true` |
| ✅ | Vincular token a `formId`, `responseId` e `sessionId` | Response/session/event rejeitam identidade divergente |
| ✅ | Salvar respostas criptografadas | Fail-closed se segredo de criptografia faltar |
| ✅ | ACK de envio após persistência canônica | Tela de obrigado não depende da disponibilidade do provedor externo |
| ✅ | Criar outbox transacional | Job nasce na mesma transação da resposta concluída |
| ✅ | Retry server-side de Sheets e webhook | Claim atômico, lease fencing, backoff, oito tentativas e dead-letter |
| ✅ | Agendar worker no Supabase de produção | Vault/Edge secret alinhados, cron ativo a cada 10 segundos e execução manual real confirmada sem expor o segredo |
| 🧪 | Testar recuperação real de falha | Lease, retry, fencing e dead-letter passaram em PostgreSQL; ensaio externo será repetido apenas para cada provedor que for habilitado |

## 8. Integrações e chaves

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Eliminar spinner infinito em Salvar/Testar | Timeouts e `finally` revisados nos handlers |
| ✅ | Testar no servidor antes de salvar credenciais ativas | Função `integration-settings` centraliza validação e persistência |
| ✅ | Nunca devolver segredo completo ao navegador | Catálogo e listagem retornam valores mascarados |
| ✅ | Atualizar chave Reoon | Chave armazenada mascarada e validada externamente com resultado válido |
| ✅ | Reoon usar teste quick e rejeitar `status:error` em HTTP 200 | Save usa quick; runtime valida família oficial de status/modo e falha fechado se configuração/provedor estiver indisponível |
| ✅ | OpenAI validar chave e modelo | Save executa uma Chat Completion mínima no modelo escolhido e exige `id` + conteúdo; chamada real continua no gate com credencial de produção |
| ✅ | Resend validar chave | Save valida chave e remetente padrão; envio só conclui com `id` oficial e usa idempotency key estável |
| ✅ | Evolution validar API e instância conectada | URL pública HTTPS protegida, estado `open` obrigatório e envio só conclui com ID da mensagem |
| ✅ | MinIO exigir HTTPS e testar credenciais | SSRF/egress protegido; ambientes privados/HTTP são recusados |
| ✅ | Pixels/GA4/LinkedIn validar credenciais possíveis | Meta v25, TikTok v1.3 e LinkedIn 202607 com ACK específico; GA4 registra honestamente apenas aceite de transporte; PII óbvia é removida dos parâmetros customizados |
| ✅ | Webhook de teste sair pelo servidor | Métodos, headers, query/body, timeout, resposta limitada e SSRF protegidos; HTTP de erro não é salvo como teste válido |
| ✅ | Exigir ACK explícito de cada provedor externo | Resend `id`, Evolution message ID, OpenAI completion, Sheets contagem/range, Meta `events_received`, TikTok `code:0` + `request_id` e LinkedIn HTTP 201 cobertos por suíte focada automatizada |
| ⏳ | Google OAuth/Sheets | Código, assinatura, escopos, refresh e ACK estão prontos; conta/Client ID/Client Secret e planilha de teste não foram fornecidos, por isso a integração permanece desativada |
| ⏳ | OpenAI, Resend, Evolution, MinIO e pixels reais | Permanecem desativados até receber credencial/sandbox; só serão chamados “habilitados” após happy path, timeout e erro reais |
| ✅ | Corrigir histórico de validação de e-mail após anonimização | Identificador seguro, reentrada obrigatória para revalidar e cache sem plaintext implementados/testados |

## 9. Analytics

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Corrigir “Tempo médio” gigantesco | Durações negativas, inválidas e acima de 24h são descartadas |
| ✅ | Formatar duração de modo compacto | `<1s`, segundos, minutos, horas e dias cobertos por teste |
| ✅ | Impedir quebra do card | Valor truncado/sem quebra, tipografia responsiva e inspeção visual local |
| ✅ | Filtrar outliers de tempo por página | Média limitada e testada |
| ✅ | Alternar análise entre drop-off por resposta e por página | Visão Página publicada mantém cada campo em sua coluna e não cria bloco extra |
| ✅ | Agrupar colunas sob um cabeçalho mesclado por página | Cabeçalho adicional funciona como célula mesclada do Excel: `colSpan` + `scope="colgroup"` sobre as colunas individuais; produção validada visualmente |
| ✅ | Manter o indicador de drop-off compacto e visível na rolagem horizontal | Card limitado a 288 px, responsivo e congelado no centro útil da tabela; Chromium confirmou posição estável após 1.200 px de rolagem e transição correta entre páginas |
| ✅ | Testar cálculo de drop-off multipágina/condicional | Última visita real, conclusão e páginas puladas cobertas por fixtures; RPC elimina limite de 10 mil em produção |
| ✅ | Remover limites silenciosos dos KPIs e funis | `get_analytics_dashboard` agrega o período completo no PostgreSQL; dashboards usam timezone do navegador e só fazem fallback explícito quando a RPC ainda não existe |
| ✅ | Consolidar retries de sessão | Linhas repetidas do mesmo `response_id` são unificadas antes do cálculo, evitando contagem simultânea como concluída e incompleta |
| ✅ | Validar analytics no domínio publicado | E2E publicado foi conciliado com sessão, resposta, ledger e pixel log; abandono/tempo continuam cobertos por fixtures e RPC |

## 10. SEO, compartilhamento e thumbnail por formulário

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Título e descrição automáticos nunca vazios | Defaults e identidade editável confirmados no HTML inicial de produção |
| ✅ | Thumbnail automática 1200×630 | PNG real 1200×630 confirmada no domínio publicado |
| ✅ | Permitir substituir thumbnail automática | `ogImage` customizado tem prioridade e pode ser removido para voltar ao automático |
| ✅ | Servir metatags no HTML inicial | Vercel Function injeta HTML antes do JavaScript em `/f/:id`; `curl` de produção confirmou o conteúdo. As rotas administrativas mantêm shell privado `noindex` e completam seus metadados por rota no runtime |
| ✅ | Open Graph completo | Título, descrição, URL, site, locale, imagem, MIME, dimensões e alt confirmados no HTML publicado |
| ✅ | Twitter/X Card completo | Card, title, description, image e alt confirmados no HTML publicado |
| ✅ | Compatibilidade de link com WhatsApp, Instagram, Facebook, LinkedIn, Pinterest e TikTok | Contratos OG/Twitter/Pinterest/Schema estão no HTML server-side; cache de cada rede continua sob controle externo |
| ✅ | SEO técnico | canonical, robots, keywords, autor/marca, favicon, tema e JSON-LD escapado confirmados no domínio |
| ✅ | Metadados da plataforma por rota | O HTML inicial traz um shell completo e `noindex`; após o roteador carregar, home, login, recuperação, dashboard, galeria, configurações, editor e fallback recebem título, descrição, keywords, canonical, OG, Twitter, Pinterest e JSON-LD específicos |
| ✅ | Evitar conflito entre SEO da plataforma e formulário | `/f/:id` preserva integralmente o HTML server-side específico do formulário; o controlador de rotas administrativas não sobrescreve título, canonical, OG ou JSON-LD público |
| ✅ | Validar crawler sem JavaScript no domínio Vercel | O HTML específico e a imagem de `/f/:id` foram lidos diretamente, sem executar a SPA; rotas administrativas permanecem deliberadamente privadas e `noindex` |

## 11. Segurança e limites de produção

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | RLS exigir proprietário/admin ativo | Migração e testes reais em PostgreSQL |
| ✅ | Bloquear autoelevação/reativação de perfil | Trigger e políticas implementados |
| ✅ | Revogar escrita pública direta de respostas/sessões/eventos/logs | Escrita somente por Edge Functions |
| ✅ | SSRF para webhooks, pixels, embeds e integrações | HTTPS, DNS e IPs privados/reservados bloqueados; redirects revalidados e resolução DNS tem timeout próprio |
| ✅ | Sanitizar vídeo/URLs externas | YouTube/Vimeo e links seguros cobertos por teste |
| ✅ | Sanitizar HTML rico também no canvas administrativo | Conteúdo armazenado sem variável não contorna mais o DOMPurify; regressão de XSS executada no editor e no público |
| ✅ | Rate limit e limite de payload | Endpoints públicos/administrativos críticos protegidos |
| ✅ | Preview em iframe sem mesma origem | Sandbox opaco, sem herdar sessão administrativa |
| ✅ | `npm audit --omit=dev` | Zero vulnerabilidades na execução final do snapshot publicado |
| ✅ | CSP e headers Vercel finais | CSP, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy e proteção de frame conferidos no HTTP real |
| ⚠️ | DNS rebinding com garantia absoluta | Mitigado por resolução/validação; eliminação total exige proxy de egress com IP pinning/allowlist operacional |

## 12. Matriz final de testes e aprovação

### Automatizados

- [x] Testes unitários de data, telefone, workflow, validação, URLs, ratings, analytics, persistência, contraste, SSRF e idempotência.
- [x] Snapshot final: **78 arquivos / 601 testes Vitest**.
- [x] Snapshot final: **83 testes Deno**, com `deno check --frozen` das **25 Edge Functions**.
- [x] `npm run verify`: TypeScript, ESLint, Vitest, probe unitário, build Vite e orçamento de bundle aprovados no Node 24.
- [x] `npm audit --omit=dev`: **0 vulnerabilidades**.
- [x] Probe read-only do domínio publicado: **70/70** requisições válidas, erro **0%**, p95 agregado **500,44 ms**; todos os sete cenários ficaram dentro do budget.
- [x] Aplicar **48 migrations** do zero em PostgreSQL/Supabase temporário compatível com PostgreSQL 15.
- [x] Aplicar as migrations no Supabase de produção, confirmar `db push --dry-run` limpo e lint remoto sem erros.
- [x] Executar regressão para grants/RLS, bootstrap concorrente, diretório administrativo, outbox, leases, fencing, dead-letter, analytics, corrida complete/partial, cron/Vault e rotas determinísticas: **159 testes pgTAP aprovados**.

### E2E local

- [ ] Criar/publicar formulário com todos os tipos de campo.
- [x] Percorrer em produção condição, variável, analytics, espera/A-B e página terminal; E2E chegou à tela de obrigado.
- [x] Confirmar zero inserts durante preview: a prova permaneceu **25 → 25** em desktop, tablet e celular; após remover fixtures históricas, o estado final ficou em **23 respostas (8 completas/15 parciais)**, todas com answers criptografados e metadata criptografada/nula, e **0 sessões de preview**.
- [x] Confirmar completas/parciais e proteção contra autosave atrasado em testes PostgreSQL; E2E confirmou uma conclusão canônica.
- [ ] Confirmar telefone/DDI e todas as regras de data.
- [ ] Confirmar hover, foco, teclado, mobile, zoom e reduced motion.
- [x] Confirmar integração inválida encerra loading com erro e não salva segredo por contrato automatizado.
- [x] Confirmar integração válida salva mascarada: Reoon foi validado e salvo server-side em produção.
- [x] Confirmar no PostgreSQL outbox, retry, lease, fencing token, dead-letter e deduplicação; entrega externa real continua no gate de produção.
- [x] Confirmar analytics contra fixtures persistidas e bordas de período; comparação com tráfego real continua no gate de produção.

### Produção

- [x] Criar/rotacionar segredo do worker sem registrá-lo no repositório ou no relatório.
- [x] Aplicar migrations no Supabase `gxotayvavefhlcvbuczq`.
- [x] Publicar Edge Functions da release.
- [x] Configurar Vault + cron do outbox e comprovar execução.
- [x] Publicar build no projeto Vercel `twobrainbr/forms` e confirmar estado `READY` no alias `pulse.leonardoscapinello.com`.
- [x] Validar login autenticado, editor, respostas, preview e formulário em `pulse.leonardoscapinello.com`.
- [x] Inspecionar HTML inicial/SEO/thumbnail por crawler sem JavaScript.
- [x] Configurar deploy automático de `main` somente depois dos gates `verify`, `edge-functions` e `database`, com ambiente GitHub `production` restrito à branch `main`, credencial dedicada ao CI e IDs fixos da equipe `twobrainbr` e do projeto `forms`; o run `31548453868` publicou o SHA aprovado em produção.
- [x] Manter um único mecanismo de publicação automática: a integração Git nativa permanece desconectada (`link: null`) devido à divergência entre a identidade GitHub da sessão Vercel e a proprietária do repositório; o GitHub Actions é o mecanismo ativo e comprovado, evitando dois deploys concorrentes por push.
- [x] Enviar uma resposta completa sintética e conferir banco/painel; o registro QA concluído foi mantido como evidência.
- [x] Testar Reoon, única integração de credencial ativa nesta rodada; integrações sem credencial permanecem desativadas.
- [x] Conferir registros de workflow/pixel sem resposta, chave ou PII em claro.
- [ ] Confirmar rollback de frontend e migrations não destrutivas.

## 13. Evolução para plataforma corporativa, SSR e performance

### 13.1. Arquitetura SSR/híbrida

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| ✅ | Servir HTML inicial e SEO do link pelo servidor/edge | Vercel Function e metadados públicos minimizados confirmados em produção |
| ✅ | Server-render do estado de boot público | O HTML inicial cacheável exibe somente o loader vetorial da marca, sem título, campos ou CTA fictícios; o formulário real entra depois de dados, fluxo inicial e módulos da primeira tela estarem prontos |
| ✅ | Loader único até o formulário estar pronto | Shell server-side, carregamento da rota pública, módulos lazy e preview do editor usam o mesmo estado visual; rede lenta local confirmou zero títulos, campos e botões provisórios, transição direta para a tela real e respeito a `prefers-reduced-motion` |
| ✅ | Boot público sem bloqueio infinito | Prefetch e módulo interativo possuem deadline fail-open; um chunk ainda pendente troca o loader por erro recuperável, e um Wait iniciado no nó Start exibe sua própria UI pulável em vez de permanecer escondido |
| ✅ | Definir a arquitetura desta release sem reescrita cega | ADR 001 adota shell híbrido em `/f/:id`, mantém o editor interativo e exige benchmark antes de SSR React completo |
| ✅ | Provar hidratação sem evento ou lead duplicado | E2E publicado produziu uma única resposta concluída; preview responsivo não alterou a contagem durante a prova |
| 📋 | Benchmark SSR/híbrido × SPA otimizada | Comparar TTFB, LCP, INP, JS, custo, cache e taxa de erro após RUM suficiente |
| 📋 | Decidir framework de SSR sem reescrita cega | Avaliar React Router Framework/SSR, Next ou adaptador Vercel somente após o benchmark |
| ✅ | Manter editor como aplicação interativa com shell otimizado | Editor permanece SPA interativa; shell server-side fica restrito ao caminho público em que traz benefício |
| 📋 | Plano de migração incremental e rollback | Só será necessário caso as métricas justifiquem SSR React completo |

SSR não será tratado como substituto de segurança. Autorização, RLS, criptografia, validação, filas e idempotência continuam obrigatoriamente no servidor independentemente do modo de renderização.

### 13.2. SLOs e budgets

| Métrica | Meta de release | Como comprovar |
|---|---:|---|
| Conteúdo inicial visível do formulário | ≤ 1 s p75 em cache aquecido/4G representativo | Lighthouse/WebPageTest + dispositivo real |
| LCP móvel p75 | ≤ 2,5 s; meta interna ≤ 1,5 s | RUM no domínio de produção |
| INP p75 | ≤ 200 ms | RUM + testes de interação/CPU limitada |
| CLS p75 | ≤ 0,1 | RUM e carregamento de imagem/fonte lento |
| TTFB do formulário | ≤ 500 ms p95 na região-alvo | Synthetic monitoring |
| Persistência canônica | ≤ 1,2 s p95 sem depender de provedor externo | Métrica na Edge Function |
| Disponibilidade do formulário | SLO a definir; proposta inicial 99,9% | Monitor multi-região + orçamento de erro |
| Perda silenciosa de lead | 0 tolerada | Reconciliação resposta/outbox e alerta |

- [x] Definir budgets por chunk/rota e bloquear regressão no CI ([relatório e medições](./RELATORIO-PERFORMANCE-RELEASE-2026-08-10.md)).
- [x] Separar login, dashboards, galeria, configurações, layout e editor em chunks de rota.
- [x] Manter `/reset-password` como rota lazy pública, fora do `AuthRoute`, preservando a sessão de recuperação.
- [x] Impedir dependências administrativas/Supabase na closure do formulário público por gate automatizado.
- [x] Recuperar erro de chunk/cache com uma única recarga automática, sem loop e com fallback legível.
- [x] Restringir service worker/cache ao formulário publicado e excluir `editorPreview`/painel.
- [x] Remover bloqueio de clique direito/F12; segurança permanece no servidor, RLS e headers.
- [ ] Medir rede lenta, CPU 4×/6×, Android intermediário e iPhone real.
- [ ] Otimizar imagens, fontes, preconnect, cache, compression e carregamento sob demanda.
- [ ] Testar cache frio, cache quente, deploy novo, offline parcial e recuperação de chunk.
- [ ] Teste de carga de leitura, início de sessão, autosave, conclusão e worker de integrações.
- [ ] Teste de pico, soak, timeout, retry, queda de provedor e recuperação sem duplicata.

### 13.3. Qualidade corporativa e duas jornadas de usuário

Os itens não marcados nesta subseção são certificações contínuas/backlog operacional, não bugs conhecidos aguardando correção nesta release. O único estado “AGUARDANDO” do plano é reservado às entradas externas identificadas na legenda.

#### Cliente que constrói o formulário

- [ ] Matriz tela × menu × botão × ícone × estado × permissão.
- [ ] Jornada criar → desenhar → configurar lógica → integrar → preview → publicar → analisar.
- [ ] Autosave, conflito de edição, undo/redo, erro de rede e recuperação sem perda. O estado agora diferencia salvo, salvando, pendente e erro; falta o E2E de queda/retorno da rede.
- [x] Exigir ACK explícito de linha/ID nas mutações críticas, conferir conjuntos em lote e cobrir `{ data: null, error: null }`, RLS, remoção concorrente e conflito; zero linhas não anuncia sucesso.
- [x] Excluir/mover formulário e alterar etiqueta restauram a UI quando o banco rejeita a operação, sem falso sucesso.
- [x] Galeria e remoção de upload exigem ACK do armazenamento antes de remover metadados/UI; falha de insert após upload aciona limpeza compensatória.
- [ ] Linguagem, discoverability, tempo por tarefa e quantidade de cliques medidos.
- [ ] Acessibilidade completa por teclado, leitor de tela, zoom e contraste.

#### Pessoa que responde ao formulário

- [ ] Jornada por campo e dispositivo, com rede/CPU limitadas.
- [ ] Validação clara sem apagar respostas ou prender navegação.
- [ ] Condições, redirect, retomada, parcial, conclusão e tela de obrigado.
- [ ] Acessibilidade e reduced motion.
- [ ] Falha de API, retry e confirmação sem submissão duplicada.

#### Engenharia e operação

- [ ] Revisão estática de funções, métodos, branches, contratos e efeitos externos.
- [ ] Cobertura por risco: unitário, integração, contrato, E2E, visual, acessibilidade e carga.
- [ ] Observabilidade frontend/Edge/DB/outbox com release SHA e scrub de PII.
- [ ] Alertas de falha de submissão, fila acumulada, dead-letter, erro de integração e latência.
- [x] Runbook de incidente, rotação de segredo, restauração, replay seguro e rollback documentado em `RUNBOOK-PRODUCAO.md`.
- [ ] Backup e restore drill documentado antes de tráfego de leads real.

## 14. Analytics geral e por formulário

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| 🧪 | Dashboard geral atual | RPC server-side sem row cap, leads únicos, p50/p95, comparação anterior, origem, dispositivo, outbox e pixels publicados; rodada visual final a confirmar |
| ✅ | Resumo escalável da Home | `get_forms_home_summary(7)` substitui N contagens e downloads limitados por arrays diários completos, owner/admin e sem PII; contrato tipado entregue para integração no frontend |
| 🧪 | Dashboard por formulário atual | Overview/funil/saúde usam agregação completa; sessões e pixels brutos são rotulados como logs recentes; rodada visual final a confirmar |
| ✅ | Funil por página, campo e caminho condicional | Página/entrada/alcance/abandono completos e cabeçalho por página validado; drill-down adicional fica no backlog |
| ✅ | Tempo médio detalhado | Total, p50, p95, página, hesitação e interações implementados com outliers tratados; tempo por pergunta fica no backlog |
| ✅ | Origem e atribuição | UTM source, referrer, dispositivo e período implementados; campanha completa, navegador e região ficam no backlog |
| 📋 | Qualidade e valor do lead | Evolução de produto: score, respostas-chave, segmentos e conversões definidas pelo formulário |
| ✅ | Saúde das integrações | Entregues, processando, retries, dead-letter e pixels client/server implementados; latência por provedor fica no backlog |
| ✅ | Comparação temporal | Período anterior de mesma duração e tendência implementados; anomalias e coortes ficam no backlog |
| 📋 | Exploração e exportação | Evolução de produto: filtros combináveis, drill-down, CSV e visualização sem expor PII indevida |
| ✅ | Definições auditáveis | Tooltips explicam fórmula/denominador; RPC recebe timezone IANA do navegador; ausência de base anterior e fallback de migration são explícitos |
| 📋 | Alertas | Evolução operacional: queda de conversão, aumento de abandono, indisponibilidade e fila de integração |

## 15. Arquitetura de marketplace de integrações

| Status | Entrega | Evidência / próximo gate |
|---|---|---|
| 📋 | Catálogo versionado de integrações | Manifesto com capacidades, autenticação, ações, triggers, campos e estado de saúde |
| 📋 | SDK/contrato de conector | Entrada/saída tipada, secrets server-only, timeout, idempotência, retry e rate limit |
| 📋 | OAuth e credenciais por ambiente | Escopos mínimos, callback assinado, rotação, revogação e sandbox |
| 📋 | Ações e gatilhos reutilizáveis no Workflow | Menu pesquisável, configuração guiada e resultados mapeáveis para variáveis |
| 📋 | Observabilidade por conector | Logs sem segredo, métricas, correlation ID, histórico e replay autorizado |
| 📋 | Política de publicação | Testes de contrato, revisão de segurança, versão compatível e rollback |
| 📋 | Priorização de novos conectores | Definir lista por impacto comercial antes de implementar integrações aleatórias |

O marketplace é uma frente de produto posterior ao gate de produção do núcleo. A fundação deve nascer agora sem bloquear a estabilização da captura de leads.

## 16. Critério de encerramento

Este trabalho só muda para **APROVADO** quando:

1. nenhum item P0/P1 deste plano permanecer aberto;
2. os itens funcionais solicitados estiverem implementados;
3. suíte, typecheck, lint, build, Deno e migrations passarem no estado final;
4. o deploy Supabase/Vercel terminar sem erro;
5. o formulário publicado salvar uma resposta real e o painel lê-la corretamente;
6. preview comprovar zero persistência;
7. SEO e thumbnail aparecerem no HTML inicial do link;
8. integrações habilitadas passarem happy path, erro e timeout, ou permanecerem explicitamente desabilitadas;
9. commit e push do SHA aprovado forem concluídos;
10. o relatório final registrar evidências, riscos residuais e qualquer bloqueio externo real.

Não será usada uma promessa irreal de “zero bugs”. O gate adotado é: **zero falha crítica conhecida, nenhuma perda silenciosa de lead, regressões críticas automatizadas e produção verificada com evidência reproduzível**.
