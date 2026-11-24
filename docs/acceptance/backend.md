# Aceite do backend local

23/11/2026. Fonte: PRD local, PRODUCT/DESIGN, docs/CONTRACT.md e decisões coordenadas registradas em docs/api.md. Implementação nova MIT, sem código do sistema descartado.

## Logout nativo e nonce efêmero, migration0018

Defeito nativo comunicado pelo root/Ops: AuthSDK signOut global falhou500 em três casos, com SQLSTATE23503 e constraint reauth_nonces_session_id_fkey; permission_denied não era a causa. A sessão Auth é apagada pelo logout nativo, sua app_session já fazia cascade, mas a FK restrict do nonce bloqueava essa exclusão.

Correção restrita à FK na migration0018: nonce→app_session passa para ON DELETE CASCADE. Pendente ou consumido, o nonce pode ser descartado com sua sessão. Nenhuma RPC, grant, configuração Auth ou processo de logout foi alterado; auditoria não participa da cascata. Nenhum DELETE paralelo contorna a API.

DDL autorizado no mesmoDB58522 e combinado com Opsctx_38b5e4c5d19d; COMMIT/exit0. `supabase/tests/logout_nonce_cascade.sql` passou **16 assertions SQL**, saída zero/ROLLBACK: FK real cascade, remoção de nonce pendente/consumido, auditoria preservada, outra sessão própria mantida até o logout global, sessões/nonces/audit do terceiro intactos e grants de DELETE do browser fechados. APPLIED+SQL_QUIESCENT enviados ao root/Ops, sem conexão/transação aberta; nenhuma nova DDL será executada por QA.

```sh
psql -h 127.0.0.1 -p 58522 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/logout_nonce_cascade.sql
```

Aceite Native AuthSDK global signOut recebido da Ops e conferido em recibo JSON modo600: **dois casos HTTP204**, nonce pendente e consumido removidos, linha específica de auditoria preservada e outro usuário com app_touch_session válido nos dois casos. Conta sintética exclusiva da Ops, sem tocar sessões UAT compartilhadas; não repeti a execução nativa. Recibo local privado: `construcao-da-area-de-membros/.local/native-logout-evidence.json`; fonte operacional `scripts/native-logout-check.mjs`, da frente Ops. Foram lidos somente estrutura/permissão e booleans/status, sem token/hash de senha/PII/links. A prova SQL16 e a prova Native2 são etapas distintas. Fonte018 entregue ao root no commit2b28e42 antes do ensaio isolado clean17→18; revisão/integração final continuam com o root. Nenhuma operação de produção, publicação ou provedor externo nesta correção.

## Correções R1/R2 da revisão independente, migrations0016/0017

Fonte do achado: `/tmp/icarus-restart-20261123/final-independent-review.md`, base integrada18e3e5a. Escopo desta correção é MFA no banco e consumo durável do convite pago; UI/Edge pertencem às outras frentes.

- R1: membro com fator Auth VERIFIED passa a exigir AAL2 no JWT e na sessão nativa, inclusive nas RPCs diretas e service_session. Sem fator verificado, membro conserva AAL1; equipe continua exigindo AAL2. Bootstrap/touch/setup/desafio ficam acessíveis explicitamente, sem liberar conteúdo ou tickets por essa exceção.
- R2: a outbox existente recebe claim UUID/lease5min, tentativas/backoff, sent separado de completed e estado uncertain para resultado ambíguo. Claim concorrente/repetido não autoriza novo envio. Paid/valor/pedido são preservados em falha de email, e sucesso de envio não concede assinatura nem confirma conta. Due limitado20 é service-only. Consumidor Edge normal pós-persistência/background e recuperação scheduled controlada pertencem à integração. Native invited_at persistido evita reenviar; timeout/lease ambíguo não é autorização para novo SMTP.
- Teste de integração do DTO encontrou colisão do campo status de outbox com status financeiro concatenado em app_process_payment; corrigido na mesma0017, preservando status paid/refunded/etc e expondo campos explícitos de convite. Nenhuma mensagem de sucesso foi emitida a partir desse teste que falhou.

DDL0016/0017 autorizado pelo root e coordenado com opsctx_38b5e4c5d19d, aplicado no mesmo58522. Após os testes, enviado APPLIED+SQL_QUIESCENT às duas frentes; nenhuma conexão/transação ficou aberta e esta frente não reabrirá DDL por QA.

**45 assertions SQL focadas** em `supabase/tests/mfa_outbox.sql`, saída zero/ROLLBACK: membro com/sem fator, fator não verificado, JWT/header aal1/aal2 versus nível nativo, staff, exceções limitadas de bootstrap/setup, grants service-only, paid persistido, lease único/repetição/claim errado, backoff, erro definitivo/ambíguo, reutilização de convite nativo, late finish mantendo completed e concessão única. **Separadamente, 4 assertions em duas sessões Postgres realmente concorrentes** em `supabase/tests/outbox_concurrency.py`, saída zero: exatamente um claim, finish sent, nova tentativa negada e nenhum acesso concedido só pelo envio; as únicas fixtures aleatórias persistidas pelo teste foram removidas no finally. Não somar esses resultados como testes Native API ou repetir a suíte109 sem causa.

```sh
npm run test:db
# Para o QA DB-only isolado:
node scripts/clean-install.mjs verify
```

Ambos os comandos executam os SQLs e a corrida da outbox pelo ID do Postgres validado. [Requisitos do Docker dedicado](../operations.md#requisitos-do-docker-dedicado).

Fixtures SQL para provar webhook normal → consumidor → Mailpit ficam em `supabase/tests/fixtures/payment-outbox.sql` e cleanup com guard/tag exatos; sem termos reais nem cobrança. Recibo de transporte fake/Native Mailpit R2 será anexado depois de recebido da integração; fonte SQL pronta não é prova desse encadeamento automático. Provedores externos permanecem desligados. Não houve publicação ou runner/CI.

## Follow-up nativo e fluxos completos, migrations0013..0015

Estado atual: **33 tabelas public, 46 RPCs app_, somente2 RPCs anon**. Migrations0013/0014/0015 aplicadas explicitamente no mesmo banco local58522, com COMMIT/exit0; sem reset nem history artificial. Novas assinaturas service-only `app_complete_password_setup(actor,session)` e authenticated/admin `app_admin_member_detail(id)`, documentadas em docs/api.md. Nenhuma publicação.

- Auth agora cria somente profile member imediatamente. `app_validate_auth_signup` é constraint trigger DEFERRABLE INITIALLY DEFERRED; no commit reconsulta auth.users pela ID e avalia app_metadata FINAL, guard de demo e termos atuais. O snapshot NEW do INSERT e confirmação de email sozinha não autorizam cadastro público. A [fonte exata Auth v2.192.0](https://github.com/supabase/auth/blob/v2.192.0/internal/api/admin.go#L399) grava metadata/confirm depois do INSERT; por isso a correção0011, apesar de modelo SQL seguro, ainda não fechava a API nativa.
- Convite/precriação server-only persiste `password_setup_required` readonly no perfil. Bootstrap/touch permitem concluir senha/MFA; entrega fica bloqueada enquanto true. Edge exige alteração de senha NATIVA bem-sucedida antes do helper de sessão exata limpar a flag; nenhum hash é usado como prova de primeira senha. Bootstrap não reaplica metadata JWT antiga.
- Suporte preserva priority `low,normal,high,urgent` e status `open,in_progress,waiting_member,resolved`. Migração tardia converte pending/closed para waiting_member/resolved. Membro só responde/reabre ticket próprio; support/admin controlam atendimento; moderador não lê ticket de terceiro.
- Ficha admin numa RPC: perfil, assinaturas, cursos/progresso, pedidos e tickets, cada lista relacionada limitada20 com total real. Sem N+1 SDK, dados de outro titular ou buyer_data/receipt/attempt secrets.
- Course DTO retorna `can_issue,certificate_reason` pelo predicado READONLY compartilhado com a emissão. Considera perfil/configuração/vigência/acesso/currículo/conclusão e emissão da versão atual. Listar curso/certificados não emite; emissão explícita/conclusão preservam lock/unique/snapshot. `app_progress` retorna causa do mesmo predicado quando não emite.

Verificação incremental, sem repetir a suíte109 inteira já verde:

```sh
psql -h 127.0.0.1 -p 58522 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/auth_creation.sql
psql -h 127.0.0.1 -p 58522 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/followup.sql
```

**17 assertions Auth/senha** passaram com SET CONSTRAINTS explícito e rollback. Cobrem INSERT sem metadata seguido de UPDATE antes da validação, reconsulta final, rejeição diferida/rollback de profile, guard de demo, flag readonly, bootstrap/touch disponíveis, entrega bloqueada, helper service-only/sessão exata e liberação sem reaplicar claim antigo. **36 assertions suporte/ficha/certificado** passaram em rollback: enums/ownership/reabertura/fila/adminAAL2, 21 assinaturas/pedidos e22 tickets limitados20 com totais reais, curso/progresso do titular, ausência de dados de B, elegibilidade read-only/causas/unique/revogação. Fixtures desses testes são transacionais. O arquivo backend.sql foi ajustado aos enums e trigger diferido; o resultado109 abaixo é preservado como evidência da base0012, não recontado como execução da versão0015.

**Aceite Native API da integração verificado nesta continuação:** recibo JSON local modo600 em `icarus-integrations/.local/native-integration-evidence.json`, exit0, **2 testes/9 passos/0 falhas**. Cinco contas AdminAuth criadas pelo fluxo nativo após0013; guard finalmente false. Booleans confirmam cadastro forjado negado, convite nativo para precriado não confirmado, email recebido no Mailpit, confirmação, primeira senha pela Edge/Auth nativos e login na mesma ID. Inclui bytes reais de MP4 privado, negativa pública, reauth sem revogar sessão principal, multipart/Storage owner/pending/no-overwrite e negativa staffAAL1. Fonte/testes da frente de integração: commits `3a9c298` e `5cdfcb0`; detalhes seguros em [aceite das integrações](../acceptance/integrations.md), recebido da worktree dessa frente. Este worker leu contagens/booleans do recibo e confirmou permissões600, sem imprimir credenciais, links de convite ou hash de senha. A integração corrigiu handling SDK de objeto ausente sem novo retry Auth.

O teste nativo de senha prova o fluxo LOCAL; não prova SMTP externo, Asaas/Bunny ou pagamento real. A revisão final e bootstrap limpo integrados continuam com o coordenador. Nenhum runner/CI executado nesta continuação.

## Entrega da base0001..0012, preservada como origem

- 33 tabelas public com RLS e nenhum grant de leitura/DML para anon/authenticated; 44 RPCs públicas com assinatura fechada. Somente `app_public_context` e `app_certificate` executáveis por anon, com comentários anon-ok. Helpers em schema privado; exceção pontual de EXECUTE authenticated para predicado da policy de upload.
- Perfis/papéis independentes de planos/vigência; direitos por recurso, revisão de suspensão/papel/assinatura em cada gate; sessão nativa Auth + idle 2h membro/30min equipe, aviso60, sem reviver sessão expirada. Bootstrap AAL1 permite configurar MFA; operações de equipe exigem AAL2, incluindo nível nativo da sessão.
- Curso → módulo → seção → aula; edição/ordenação/publicação/arquivo/restauração com pais e IDs preservados. Currículo obrigatório versionado; arquivar não fabrica conclusão, não remove aula do requisito e não apaga progresso/certificado. Progresso monotônico, conclusão explícita.
- Certificado transacional único por titular/curso/versão, código192bits, snapshot do aluno/curso/aulas/carga/responsável/assinatura. Zero aulas, preview apenas, incompleto, vigência inválida, configuração ausente ou currículo inacessível não emitem. Reprodução/listagem não emitem. Emissão explícita usa o mesmo helper da conclusão.
- Materiais/pastas privados; ticket próprio/equipe autorizada com thread/anexos; comunidade com posts/respostas pendentes, moderação manual, votos únicos e denúncias sem punição automática. Editar post ou trocar imagem retorna para revisão.
- Admin por whitelist de entidade/campos/papel; membros/cortesia/papéis/suspensão por RPC crítica com motivo e reauth de ator+sessão/hash/5min/usoúnico. Consumo e mutação na mesma transação, rollback restaura o nonce se a ação falhar. Sem mass-assignment de owner/role/paid.
- Oito chaves permitidas de empresa, perguntas simples editáveis sem builder; opções completas só onde o PRD realmente as enumera. Export do próprio titular e solicitação administrativa pendente, sem afirmar exclusão automática. Tour/feedback por ator/página.
- Checkout service-only reserva exclusiva por tentativa, recibo imutável, reconciliação em retry sem vínculo. Webhook só normalizado/estrito, vínculo checkout/valor/método verificados, evento único e estados terminais. Compra convidada não cria autenticação por email do browser; outbox persistida e concessão só para Auth de email confirmado. Duplicata não dispara outro convite. Bootstrap pode finalizar pedido pago próprio depois da confirmação.
- Bucket privado até500MiB; reserva15min, path gerado, Storage INSERT JWT só path/ator/reserva/gate/sessão atual. Sem policy de SELECT/UPDATE/DELETE. Finalize confere objeto+metadata real e autorização antes de ready. Edge valida magic bytes. Avatar5MiB raster próprio, anexos50MiB, imagens10MiB. Media só por recurso autorizado e upload pronto.
- RPCs service-only de ação humana exigem headers internos de sessão/AAL derivados pela Edge do JWT verificado; SQL cruza sessão exata/ator/idle/expiração/AAL nativo. Webhook/outbox/finalização de pagamento não dependem de sessão do beneficiário.
- Trigger Auth nativo valida signup/aceites legais. Criação administrativa pode usar marcador server-only em app_metadata, sem conceder plano/papel/confirmar email. Flags homônimas em user_metadata não autorizam cadastro. Demo exige também marcador privado SQL e permanece explicitamente sintética; termos demo não habilitam cadastro/checkout.

## Comandos e resultados reais

Banco usado exclusivamente: projeto `icarus-courses-local`, Postgres local `127.0.0.1:58522/postgres`. Cada migration0001..0012 foi aplicada explicitamente via psql com `ON_ERROR_STOP=1`, BEGIN/COMMIT e saída zero; não foi criada migration history fictícia. O banco estava novo na aplicação0001. Correções posteriores foram aplicadas como migrations novas. Nenhum start/stop/reset de outro projeto.

```sh
psql -h 127.0.0.1 -p 58522 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/backend.sql
psql -h 127.0.0.1 -p 58522 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/auth_creation.sql
git diff --check
```

`backend.sql`: **109 assertions aprovadas**, saída zero e ROLLBACK. Papéis reais `anon,authenticated,service_role`; atores A/B/admin/moderador/suporte/instrutor/expirado com claims e sessões Auth de teste. Positivos/negativos de grants/RLS, massa indevida, draft, plano/preview, progresso/certificado, moderação/edição/denúncia/voto, ticket A/B/suporte, privacidade, AAL1/AAL2, injeção por entidade, reauth inválida/usoúnico/rollback, pagamento/retry/recibo/vínculo/valor/método/evento duplicado/refund terminal/convidado/outbox, upload/pending/ready/metadata/pathA/B/suspensão/prazo/sessão exata. Nenhuma fixture desse arquivo é persistida. A representação de termos configurados da transação financeira é apenas fixture isolada revertida, não política real habilitada.

`auth_creation.sql`: **7 assertions aprovadas**, saída zero e ROLLBACK. Signup com serverflag forjada em user_metadata negado; nenhuma profile residual; app_metadata legítima cria somente membro não confirmado e sem assinatura; flag de demo negada com guard desligado; guard privilegiado habilitado permite fixture member.

Consulta de catálogo real confirmou `public_tables=33, public_rpcs=44, anon_rpcs=2, reserved_upload_policies=1`. `git diff --check` sem erro. Nenhum workflow/PR/runner executado; custo de CI deste worker: zero minutos usados. A cobertura SQL de segurança/financeiro foi mantida; build/TypeScript/browser pertencem às outras frentes.

## Limitações e próximos gates

- Testes SQL de claims são testes reais de permissões/RLS/RPC, e não substituem Native Auth/Storage/Edge. O follow-up acima registra a causa residual da0011 e o recibo nativo positivo posterior à0013.
- O coordenador comprovará bootstrap/upgrade integrado e instalação limpa pelo mecanismo Supabase da raiz; aplicação manual não foi apresentada como migration history do CLI.
- Não houve Asaas/Bunny/email remoto, cobrança, convite recebido, servidor/cloud/Oracle, deploy, PR ou publicação. Sem contas/credenciais/oferta/termos definitivos, esses gates permanecem externos. Checkout sem provider deve permanecer indisponível na Edge; SQL normalizado não é venda homologada.
- URLs assinadas têm janela residual até o TTL. Nova emissão de URL reavalia direitos; isto não promete revogação instantânea de bearer URL já entregue.
- Conteúdo/contas/media demo são responsabilidade do script local, sem senha compartilhada no seed. app_local_demo só habilita ready após objeto existir com metadata real, e não é integração Bunny. Guard SQL deve voltar a false no finally do script.
- Processar pedido de exclusão requer decisão administrativa e retenções legais, sem exclusão automática simulada. Legal/assinatura comercial definitiva não foi inventada.

## Diagnóstico e aprendizado desta execução

| Fato observado | Coberto por | Destino | Decisão |
|---|---|---|---|
| SQL com email_confirmed_at já preenchido passava; Native Auth Admin faz INSERT antes do UPDATE de confirmação e falhou no trigger. | AppSec: validar fluxo real na fronteira autoritativa; separação SQL versus Native API. | Este aceite e coordenador para eventual armadilha do projeto. | Registrar causa/prova/limite; migration0011 e teste específico, sem tratar health200 como prova de criação. |
| Mesmo marcador seguro app_metadata chega por UPDATE depois do INSERT; o teste SQL0011 com metadata pronta não provava a ordem Native API. | AppSec/Ponytail: reproduzir a fronteira e a transação reais. | Este aceite e coordenador para eventual armadilha do projeto. | Corrigido por constraint trigger deferred que RESELECT a linha final e testes SET CONSTRAINTS; NativeAdmin/convite/primeira senha positivos após0013. Não declarar7asserts antigos como aceite nativo. |
| Coluna nativa auth.sessions.aal colidiu com variável local aal em teste real após vincular sessão service. | Ponytail/AppSec: teste pequeno de lógica nova antes de concluir. | Código/teste, derivável do Git. | Corrigido nome session_aal; não criar regra global nem memória duplicada. |

Este worker não escreveu memória/cofre fora da propriedade exclusiva; o coordenador recebe estas evidências para consolidação autorizada.
