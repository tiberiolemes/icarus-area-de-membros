# Contrato único — Icarus novo

Este contrato é compartilhado entre as três frentes. Se precisar mudar assinatura/DTO, avisar antes e combinar. Não criar fallback que finge backend/provedor. Entrega: Fase1 + comunidade básica pré-moderada; não herdar código Frappe nem criar multi-tenant.

## Convenções
- React/TS/Vite e Supabase local real. Schema public; RPC prefixo app_. Roles: member, instructor, moderator, support, admin. Planos e papéis separados. Nomes técnicos em inglês, textos PT-BR.
- IDs uuid, montantes integer cents, datas timestamptz e exibição Brasília. Curso/module/lesson usam slug no caminho, IDs em mutação. Toda lista limitada20/servidor e retorno {items,total,page,page_size:20}; buscar/ordenar no servidor antes de limitar.
- DB/RLS é autoridade. Cliente não envia user_id/owner_id/role/paid como fato. Grants explícitos; anon só app_public_context e app_certificate com comment anon-ok e DTO mínimo.
- Publicado/rascunho/arquivado são estados distintos. Arquivo preserva relações, progresso e certificados. Nenhuma exclusão física automática do currículo. Certificado exige currículo obrigatório completo e não vazio, uma emissão/snapshot; plano não pode fabricar conclusão.
- Retornos de RPC são JSON. Erros têm mensagem PT-BR segura; frontend mapeia erros de autenticação/conflito/limite sem expor SQL. SQL e constraints continuam falhando quando não são conflito esperado.
- Descrição rica poderá usar editor pontual existente; corpo de comunidade/ticket é texto inicialmente. Não renderizar HTML não sanitizado.

## DTOs compartilhados
Profile: {id,full_name,email?,phone,bio,company:object,role,theme,plan_name,access_ends_at,suspended,onboarding_complete}. Plano/role nunca editáveis por app_profile.
Plan: {id,name,slug,price_cents,access_months,benefits:string[],active}. Não semear preço/copy da arr.academy.
Course: {id,slug,title,description,cover_url,status,access_mode,plan_ids,certificate_enabled,required_lessons,total_lessons,completed_lessons,progress_percent,duration_seconds,can_access}.
Module: {id,slug,title,order_index,can_access,sections:Section[]}; Section: {id,title,order_index,is_bonus,lessons:LessonSummary[]}.
LessonSummary: {id,slug,title,duration_seconds,type,order_index,can_access,completed}. lesson_detail inclui body/video_id/storage_path SOMENTE quando autorizado.
Material: {id,name,description,file_type,size_bytes,folder_id,lesson_id?,can_access}. Nunca devolver storage_path para não autorizado.
Certificado: {id,code,student_name,course_title,duration_minutes,issued_at,revoked_at,demo}; dados públicos sem email/CPF.
Post/Reply: {id,author_name,author_id,author_role,plan_name,title?,body,status,created_at,vote_count,voted,reply_count?,can_edit}; Post inclui can_archive e can_restore calculados pelo servidor, além de avatar_id/image_id e campos existentes. Membro vê aprovados e estados próprios conforme o gate do espaço; can_edit é falso em archived/removed. Imagens seguem o gate.
Ticket: {id,subject,priority,status,created_at,messages:[]}; mensagem {id,author_name,body,created_at,attachments:[]}.

## RPCs do backend (frontend chama supabase.rpc)
app_public_context() -> {name,legal_ready,registration_enabled,legal_versions,plans}. Público mínimo, sem secrets.
app_bootstrap() -> {profile,plans,settings}; settings tem nome/contato/URLslegais/capacidades não secretas.
app_catalog(p_query text='',p_page integer=1) -> página de Course.
app_course(p_slug text) -> {course,modules:Module[]}.
app_lesson(p_id uuid) -> {lesson,course,module,materials:Material[],position_seconds,completed,previous_id,next_id,can_access,reason}.
app_progress(p_lesson_id uuid,p_position_seconds numeric=0,p_complete boolean=false) -> {completed,position_seconds,course_progress_percent,certificate_code?}.
app_materials(p_folder_id uuid=null,p_query text='',p_page integer=1) -> {folders,items,total,page,page_size}.
app_certificates() -> {items: certificados emitidos, courses: progresso de cursos certificáveis}; SOMENTE LEITURA. app_progress com p_complete=true tenta emitir na mesma transação ao atingir currículo válido, total>0, emissão única/snapshot; reprodução/read não emitem.
app_certificate(p_code text) -> certificado público mínimo ou erro indisponível.
app_profile(p_data jsonb) -> Profile atualizado; campos autorizados: full_name,phone,bio,company,theme,onboarding_complete.
app_tickets(p_page integer=1) -> página de tickets próprios ou fila autorizada.
app_ticket(p_id uuid) -> Ticket.
app_create_ticket(p_subject text,p_priority text,p_body text) -> {id}.
app_ticket_reply(p_id uuid,p_body text,p_status text=null) -> {id,status}.
app_feed(p_space_id uuid=null,p_query text='',p_page integer=1) -> {spaces,items,total,page,page_size}.
app_post(p_id uuid) -> {post,replies,can_moderate}.
app_save_post(p_id uuid,p_space_id uuid,p_title text,p_body text,p_image_path text=null) -> {id,status}; p_id null cria, editar reenvia para aprovação.
app_archive_post(p_id uuid,p_archived boolean) -> {id,status,archived}; somente titular com sessão/acesso vigente ao espaço. Arquiva pending/approved/rejected; restaura apenas arquivamento próprio ao estado anterior permitido, sem nova aprovação. Marcador privado durável diferencia autor de operação administrativa, inclusive quando o admin é o autor; legado sem origem não autoriza restauração própria. Trava, escrita e auditoria são transacionais; repetição da mesma operação já concluída retorna estado sem duplicar auditoria. A operação pessoal reversível não exige nonce de reautenticação; app_admin_archive mantém o consumo existente. Arquivados preservam texto, imagem, datas originais, respostas e votos, ficam legíveis ao autor/equipe com gate e não admitem novas interações ou finalização de imagem pendente.
app_reply(p_post_id uuid,p_body text) -> {id,status}.
app_vote(p_target_type text,p_target_id uuid) -> {vote_count,voted}.
app_report(p_target_type text,p_target_id uuid,p_reason text) -> {id}.
app_moderate(p_target_type text,p_target_id uuid,p_decision text,p_reason text) -> {id,status}.
app_admin_list(p_entity text,p_query text='',p_page integer=1) -> página autorizada com whitelist.
app_admin_save(p_entity text,p_id uuid,p_data jsonb) -> {id}; p_id null cria; não é SQL genérico ou mass-assignment.
app_admin_archive(p_entity text,p_id uuid,p_archived boolean,p_reauth_token text) -> {id,archived}.
app_admin_member(p_id uuid,p_data jsonb,p_reason text,p_reauth_token text) -> Profile.
app_export_data() -> dados do titular sem tokens/segredos/terceiros.
app_privacy_request(p_kind text) -> {id,status}; solicitação administrativa honesta, não declarar exclusão realizada antes de processamento.
app_touch_session(p_activity boolean=false) -> {expires_at,warning_seconds:60}; idle 2h membro,30min equipe; sessão inválida negada no servidor.
app_help_feedback(p_page text,p_action text,p_rating boolean=null) -> {ok}; tracking de tour por ator/página, sem conceder acesso.
Entidades admin: courses,modules,sections,lessons,material_folders,materials,plans,spaces,profiles,orders,posts,replies,reports,tickets,audit_events,legal_versions,privacy_requests. Backend documenta campos aceitos em docs/api.md antes dos editores finais.
Reauth server-only: app_confirm_reauth(p_actor_id uuid,p_session_id uuid,p_token_hash text) e consumo interno, sem EXECUTE authenticated. Front recebe token da Edge reauthenticate, mantém somente em memória, limpa ao fechar.

## Funções Edge (integrações)
capabilities: GET/POST -> {asaas:boolean,bunny:boolean,storage:true,email:local|configured,mode:local|production}; sem credenciais/URLsprivadas.
reauthenticate: POST {password} com JWT -> {token,expires_at}; valida usuário atual via Auth, senha via signIn nativo sem log/guardar; token aleatório curto vinculado a ator+session_id, hash no banco. Requer MFA quando ator precisa.
checkout: POST {plan_id,method:PIX|CREDIT_CARD,installments,attempt_key,buyer:{name,email,document,phone},legal_version_ids,marketing_opt_in} com JWT opcional -> {order_id,status,url?,pix?:{encodedImage,payload,expiresAt}}. Sem provider retorna503 CONFIGURATION_REQUIRED, nenhuma cobrança/pedido pago; checkout hospedado Asaas para não trafegar cartão. Comprador novo NÃO precisa criar conta antes: pedido anônimo pendente; após webhook confirmado o servidor envia convite nativo para o email de compra e vincula direitos ao titular, nunca autentica o browser por email informado. Membro autenticado usa identidade/email do token. order-status POST {order_id,receipt_token} permite somente titular autenticado ou token opaco de recibo vinculado ao pedido; resposta pública mínima, sem CPF/email.
asaas-webhook: POST JSON com asaas-access-token; verify_jwt=false só aqui e token dedicado verificado antes de persistir. Evento id único, valor/pedido/estado conferidos e transação idempotente. Não capturar SQL arbitrário nem reativar reembolso por evento antigo.
media: POST {kind:lesson|material|ticket-attachment,id} com JWT -> {url,expires_at,provider}. Can_access do banco novamente; storage privado/Supabase ou Bunny assinatura. TTLcurto; ausênciaBunny503 com causa; fixturelocal MP4 só explicitamente demonstração e protegido.
upload: POST metadados {kind,resource_id,file_name,content_type,size_bytes} -> signed upload ou upload controlado com gate servidor, whitelist/tamanho/path gerado. Não aceitar bucket/path arbitrário do browser.
Funções service-only a fornecer pelo backend: app_checkout_begin(p_actor_id,p_plan_id,p_attempt_key,p_method,p_installments,p_buyer_data,p_legal_version_ids,p_marketing_opt_in,p_receipt_hash), app_checkout_gateway(p_order_id,p_gateway_id,p_checkout_url), app_process_payment(p_event jsonb), app_finalize_paid_order(p_order_id,p_actor_id), app_order_status(p_order_id,p_actor_id,p_receipt_hash), app_media_access(p_actor_id,p_kind,p_id), app_upload_access(p_actor_id,p_kind,p_resource_id,p_file_name,p_content_type,p_size_bytes).
Integrações e backend podem ajustar nomes/assinaturas por mensagem coordenada ANTES de implementar consumidores, registrando atualização neste contrato.

## Propriedade e execução
Backend: supabase/migrations, supabase/seed.sql, supabase/tests, docs/api.md, docs/acceptance/backend.md. Pode testar o Supabase LOCAL icarus-courses-local, API58521/DB58522; não há dados reais neste projeto novo. Sem reset de outro projeto.
Frontend: src/**, public/** (preservar assets), docs/help/**, docs/acceptance/frontend.md. Não editar package/config/migrations/Edge; peça dependência concreta quando necessário.
Integrações: supabase/functions/**, scripts/**, tests/integration/**, docs/acceptance/integrations.md. Não alterar DDL da frente backend; combinar contrato dos RPCs antes de testar.
Coordenador: package/config raiz, Supabaseconfig, PRODUCT/DESIGN, docsdeanálise, integration/finalreview/release. Worktrees separadas, commits lógicos dos próprios arquivos; enviar hash/relatório. Nenhuma frente publica, mexe em cloud/Oracle, gera cobrança, acessa outro projeto ou reintroduz código Frappe.

Checkout pós-pagamento: evento pode produzir outbox/convite pendente. Falha de email não apaga pagamento; reprocessar convite com guarda única e vinculação segura, sem novo pagamento. Duplicata de webhook não duplica concessão nem convite. Pedido pago ainda sem conta precisa aparecer na fila administrativa, sem fingir login/primeira venda homologada.

## Ajustes coordenados 23/11 (antes de consumidores)
- Checkout usa Asaas HOSPEDADO. app_checkout_begin inclui create_gateway:boolean, verdadeiro SOMENTE na inserção/reserva nova. Repetição do attempt_key nunca dispara nova cobrança, conserva receipt_hash original; tentativa sem gateway conhecido retorna reconciliation_required, sem liberar nem criar outra cobrança. Não persistir token em claro.
- Edge normaliza CHECKOUT_* com gateway_id=checkout.id. PAYMENT_* não pode usar payment.id como se fosse checkout.id: mapear vínculo por campos/consulta oficiais e manter refund/chargeback conservadores. Valor e método vêm de payload/consulta AUTORITATIVA do gateway; sem prova suficiente, manter reconciliação pendente. Nunca retornar callback/successUrl como pagamento.
- app_finalize_paid_order(p_order_id,p_actor_id uuid=null) procura internamente auth.users por email confirmado vinculado ao pedido pago; não confiar no browser. Ausência/não confirmado retorna finalized=false, sem scan listUsers. Quando p_actor_id explícito, exigir a mesma correspondência. app_bootstrap após confirmação de email pode finalizar o próprio pedido já pago pelo mesmo helper, para o convite não depender de outro webhook. Não reenviar convite automaticamente a cada duplicata.
- Upload é multipart/FormData CONTROLADO na Edge, com metadados kind/resource_id e arquivo file. Conferir o arquivo recebido e limite real além de MIME/tamanho declarados; gate app_upload_access antes de gravar, compensar estado pendente em falha. Evitar URL de upload válida por horas sem esses controles.
- Convite novo exige definir a própria senha no callback/primeiro acesso. JWT de convite por si não deve pular essa etapa; feedback claro e suporte para link expirado/reenvio.
- Destino final confirmado pelo usuário: fonte pública MIT no mesmo GitHub; instalação no servidor e credenciais externas virão DEPOIS desta entrega. Integração configurável/local não se declara homologada em produção.

## Complemento de campos e ciclo de arquivos
- Onboarding usa perguntas configuráveis simples, type text/select/textarea, opções/required/active/ordem, sem builder visual. Company comporta name,segment,role,size,stage,revenue_range,acquisition,product_description, com validação por pergunta ativa.
- Emissão de certificado guarda signer_name,signer_title,signature_url configurados; app_issue_certificate(p_course_id) usa o MESMOhelper da conclusão e não transforma app_certificates em escrita.
- Media inclui course-cover/post-image/avatar por IDdo upload; path é canônico, URLassinada é só resposta transitória. Foto de perfil5MiBraster+recorte, própria e pronta.
- Materiais/lessonaté500MiB: Edge reserve → Storage.upload nativoAuth/upsertfalse/pendingpathRLS+TTL15min → Edge finalize(metadadoreal/magic+DB). Conteúdo sóready élegível. Anexo/imagens pequenos podemmultipartcontrolado. Bucketglobal500MiB éconfiguração; não é prova de upload real nessa carga.
- Helpers service-only complementares: app_payment_context(p_order_id,p_gateway_id=null), app_payment_outbox(p_order_id), app_upload_context(p_actor_id,p_id), app_upload_finalize(p_actor_id,p_id), app_upload_cancel(p_actor_id,p_id). App_local_demo JSON5atores sócomguardDBprivilegiado e modo local, nunca setterpublic.
- Nenhum ajuste global do Docker/firewall: binds locais dos3serviçosforam corrigidosespecificamente, Config/HostConfig/mounts/aliases mantidos e DB/Auth/Storageverificados.
