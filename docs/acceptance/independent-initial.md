# Revisão independente final — Icarus novo

**Resultado: 2 defeitos P1 e 2 P2.** Fonte integrada `18e3e5a5364ed35c07955edb7477cea3052e613d`, árvore limpa no início e no fim. Escopo: Fase 1 + comunidade manual; nenhuma conclusão herdada do Frappe.

## R1 · P1 · MFA ativado pelo membro não é exigido nas RPCs de conteúdo

**Local:** `supabase/migrations/202611230013_auth_commit_and_password.sql:40`. Conectados: `supabase/migrations/202611230013_auth_commit_and_password.sql:45`, `supabase/migrations/202611230013_auth_commit_and_password.sql:56`, `src/auth.tsx:149`, `src/pages/settings.tsx:193`, `src/pages/access.tsx:162`, `supabase/functions/_shared/client.ts:31`.

**Cenário:** Membro ativa TOTP em Configurações e depois faz novo login só com senha; recebe sessão aal1 e acessa app_catalog, app_post, app_ticket, app_progress e demais RPCs de membro sem validar código.

**Causa e impacto:** actor() exige aal2 apenas se role diferente de member; service_session() também dispensa member. O Gate do React só envolve equipe em StaffAssurance. As Edge verificam fatores ativos, mas isso não protege os caminhos diretos ao banco. A proteção oferecida ao membro pode ser contornada com senha isolada; conteúdo textual, comunidade e tickets continuam acessíveis ao portador dessa senha. Não é bypass do MFA obrigatório de admin, que possui gates separados.

**Prova:** Inspeção conectada da última redefinição SQL e consumidores; não executei autenticação nem criei fatores no banco.

**Correção mínima:** Exigir aal2 também quando o ator possui fator verificado, nas autoridades SQL/serviço, mantendo exceção explícita só para bootstrap/configuração do desafio; apresentar desafio ao membro no login/Gate.

**Aceite:** Membro com TOTP verificado e JWT aal1 deve ser negado em RPC direta de conteúdo/ticket e aceito após desafio aal2; membro sem fator continua aceito, equipe aal1 permanece negada.

## R2 · P1 · Pagamento de comprador novo não dispara criação de conta/convite automaticamente

**Local:** `supabase/functions/asaas-webhook/index.ts:13`. Conectados: `supabase/migrations/202611230005_integrations.sql:88`, `supabase/migrations/202611230005_integrations.sql:19`, `supabase/functions/_shared/payment.ts:43`, `scripts/recover-invites.ts:4`, `scripts/recover-invites.ts:8`.

**Cenário:** Email ainda sem conta paga checkout; webhook válido registra paid e invitation_outbox pendente. finalize_order não encontra auth.users confirmado, então não concede acesso. O handler responde 200 e encerra.

**Causa e impacto:** O único consumidor de finishPaidOrder é um script manual por order_id, restrito ao modo local; não existe consumidor automático da outbox no runtime da aplicação. Bootstrap só finaliza para uma conta que já existe e confirmou email. O comprador novo não recebe a conta/convite prometido pelo checkout e não consegue definir primeira senha sem intervenção operacional. A prova isolada da Edge password-setup não cobre o encadeamento pagamento -> convite.

**Prova:** Busca de todos os chamadores de finishPaidOrder/app_payment_outbox e leitura webhook -> SQL -> recuperação; sem pagamento ou email real.

**Correção mínima:** Conectar consumo durável/idempotente da outbox ao fluxo normal após pagamento, com retentativa controlada e estado de envio, preservando o script como recuperação excepcional; não aguardar email antes de persistir/confirmar evento.

**Aceite:** Evento pago sintético de email novo cria exatamente um fluxo de convite pelo consumidor normal, sem comando manual por pedido; falha de email preserva paid e é retomada sem nova cobrança/concessão duplicada.

## R3 · P2 · Callback do Asaas aponta para rota inexistente

**Local:** `supabase/functions/checkout/index.ts:20`. Conectados: `src/main.tsx:171`, `src/pages/checkout.tsx:119`.

**Cenário:** Checkout criado com sucesso no Sandbox recebe successUrl/cancelUrl/expiredUrl em /checkout/pedido/{id}; ao retornar do provedor o roteador cai em Página não encontrada.

**Causa e impacto:** A única rota de acompanhamento registrada é /pedido/:pedido, também usada pela navegação interna; o gerador do callback acrescenta /checkout indevidamente. Retorno pós-pagamento/cancelamento/expiração interrompido, embora webhook possa ter atualizado corretamente o pedido.

**Prova:** Comparação literal do callback enviado ao provedor com tabela de rotas; sem navegação externa.

**Correção mínima:** Gerar callback para a rota pública existente e adicionar regressão do contrato de rota; revisar o retorno de convidado sem presumir persistência do Map de recibos após sair para o provedor.

**Aceite:** Todos os callbacks gerados resolvem OrderStatus no roteador e mostram resposta segura de acordo com autenticação/recibo, nunca 404.

## R4 · P2 · Celular anunciado como opcional bloqueia o checkout

**Local:** `supabase/functions/checkout/index.ts:12`. Conectados: `supabase/functions/checkout/index.ts:13`, `src/pages/checkout.tsx:146`.

**Cenário:** Usuário deixa em branco Celular (opcional), preenche nome/email/documento e prossegue.

**Causa e impacto:** text(buyer.phone,20) rejeita vazio e a regex seguinte exige de 10 a 13 dígitos; o input não é required. Compra legítima recusada antes da reserva de pedido com mensagem genérica de dados inválidos.

**Prova:** Reprodução direta do handler com dependências sintéticas: HTTP 422, zero chamadas de rede/banco; formulário conectado mostra opcional.

**Correção mínima:** Alinhar frontend e Edge ao contrato de celular opcional: aceitar/omitir vazio e validar formato apenas se informado, respeitando exigências efetivas do provedor.

**Aceite:** Celular vazio segue sem erro local se opcional; celular preenchido inválido retorna erro de campo; nunca dizer opcional quando for obrigatório.

## Verificação e limites

- `node scripts/test-integrations.mjs`: **30 aprovados, 0 falhas**, transporte inteiramente simulado.
- Checagem dirigida por `deno eval`: celular vazio recusado com **422**, zero chamadas de rede/banco.
- Não executados: SQL/DB e testes nativos que gravam fixtures; criação de usuário/sessão/fator/primeira senha; browser UAT/build global concorrente; Asaas/Bunny/email externo; deploy/publicação; cobrança real.
- Somente os dois relatórios autorizados foram escritos. Nenhuma fonte, runtime, banco ou credencial alterada/lida.

## Fluxos inspecionados sem defeito adicional demonstrado

- Tabelas privadas fechadas com RLS e grants; RPCs expostas usam actor/require_role; funções financeiras/service-only não concedidas a authenticated/anon na fonte.
- Token dedicado Asaas é checado antes do processamento; pedido/evento têm identidade/vínculo e transações idempotentes, sem confirmação por callback.
- Mídia usa gate de objeto e URL assinada curta; upload reservado valida titular/destino/estado e finalização confronta metadados e bytes.
- Certificado emitido no servidor com currículo não vazio, elegibilidade por plano/aula, snapshot e código; PDF consome registro, sem emissão local.
- Comunidade pendente só é exposta a autor/equipe até aprovação; ticket e anexo conferem titular ou suporte/admin.

- Observações positivas são revisão de fonte e testes simulados, não atestado de grants/RLS do servidor ou ausência total de vulnerabilidades.
- Não inspecionei followup de UI posterior a 18e3e5a; os achados R3/R4 devem ser reconciliados com esse followup.
- Configuração de providers/JWT do webhook e recuperação operacional precisam ser conferidas ao preparar execução externa; sem credenciais, não existe homologação externa.
- Fonte pública MIT é o destino informado, sem alteração/publicação nesta revisão.

**Recomendação:** Corrigir R1/R2 antes de aceitar segurança e compra nova; corrigir R3/R4 no fluxo de checkout e repetir apenas regressões afetadas. Publicar fonte não comprova operação comercial.
