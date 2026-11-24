# Integrações e operação local

Entrega nova MIT, sem código da base descartada. Este relatório distingue transporte simulado de Supabase local real. Não há conta Asaas/Bunny, cobrança real, SMTP externo, emissão fiscal ou deploy homologado.

## Contratos implementados

As nove funções exportam `createHandler(dependencies)` e `handler`; `Deno.serve` só executa quando o módulo é a entrada. SDK Supabase fixado em `2.119.2`, sem serviço Node adicional. Helpers compartilhados apenas para HTTP, cliente validado, assinatura/tipo de arquivo e evento de pagamento.

| Função | Autoridade e falha segura |
|---|---|
| capabilities | Flags públicas, sem tokens/URLs privadas. Ausência de fornecedor é explícita. |
| reauthenticate | Auth `getUser` + `getClaims`, sessão/idle no DB; senha nativa em cliente isolado; MFA exigido para equipe/fator verificado. Nonce aleatório de 256 bits, somente hash SHA256 no DB, cinco minutos, ator + sessão e consumo único pelo backend. Logout `scope:local` exclusivamente da sessão verificadora. |
| password-setup | Somente email confirmado e sessão exata; `PUT /auth/v1/user` nativo com JWT do titular, sem Admin override ou refresh fabricado. Apenas HTTP200 e mesmo usuário permitem helper service-only concluir `password_setup_required`. Falha mantém pendência. |
| checkout | Apenas Sandbox preparado; produção retorna `503 CONFIGURATION_REQUIRED`. Oferta, valor, termos e identidade são validados pelo backend. A compra de visitante cria um pedido pendente e reserva `create_gateway` no banco antes do POST. O retry sem vínculo exige reconciliação. O checkout novo recebe o hash do recibo do navegador. O fluxo legado só recebe o recibo opaco na criação. O hash original é preservado no retry. |
| asaas-webhook | `asaas-access-token` dedicado, comparação de hashes em laço sem retorno antecipado antes de ler/persistir JSON. `CHECKOUT_PAID` confirma pagamento, nunca callback. Evento normalizado mínimo, sem CPF/email/cartão. DB confere vínculo, valor, método, id único e estados terminais; só confirma HTTP200 após transação persistida. |
| process-invites | Credencial de serviço exclusiva, lote devido limitado20 e claim idempotente; nenhuma autoridade por callback. |
| order-status | Titular autenticado ou recibo daquele pedido nas primeiras duas horas da reserva. Retorna apenas ID, estado, valor e confirmação de acesso. |
| media | Gate por recurso no DB antes de URL; bucket privado e TTL120s. Bunny assina SHA256 hex de chave + vídeo + expiração; chave e biblioteca ficam no servidor. Embed assinado não comprova proteção do CDN/original. |
| upload | Multipart controlado até20MiB, imagens até5MiB; MIME/extensão, bytes iniciais e tamanho real. Material/aula até500MiB por reserva + Storage nativo, sem buffer Edge. Registro pendente só fica legível após finalize com bytes iniciais via Range32 e metadata real conferida no DB. |

Chamadas humanas service-role carregam `x-icarus-session-id` e `x-icarus-aal` derivados exclusivamente das claims verificadas. Esses headers são gerados em um cliente novo por request, nunca copiados do browser. `app_touch_session(false)` não renova atividade em fetch. Backend reavalia sessão exata, perfil atual e permissão; webhook/outbox/beneficiário pago têm contrato de serviço distinto.

Eventos `PAYMENT_REFUNDED`, estorno parcial e chargeback são vinculados ao checkout armazenado por consulta oficial `GET /v3/payments?checkoutSession=...&limit=100`: o pagamento do evento deve existir na resposta, valores/método reais devem coincidir e a soma real das parcelas deve corresponder ao pedido no DB. Sem dados suficientes ou vínculo, retorna reconciliação pendente; não usa o valor esperado para fabricar confirmação. Apenas `CHECKOUT_PAID` concede; eventos individuais de parcela paga não concedem acesso antecipado. Refund/chargeback do pedido retiram o direito daquele pedido; evento antigo não o reativa.

Conta pós-pagamento: o DB só finaliza para Auth com email confirmado correspondente ao comprador confirmado. Caso contrário, mantém outbox. O webhook agenda entrega automática após persistência usando `EdgeRuntime.waitUntil`. A outbox durável tem claim exclusivo, lease e backoff; o worker de serviço processa vencidos. `scripts/recover-invites.ts` reutiliza o mesmo claim em recuperação explícita, sem cobrar novamente. Falha definitiva permite retry; ambiguidade vira uncertain e exige reconciliação, sem reenvio cego. Markers de criação/primeira senha ficam em app_metadata exclusivo do AdminAPI, nunca user_metadata. Nenhuma senha é informada no precreate; o Auth nativo pode gerar internamente uma credencial aleatória inacessível, por isso a flag obrigatória de primeira senha só é concluída pela Edge após alteração nativa. Convite enviado não significa email recebido, confirmação ou login. `app_bootstrap` vincula o próprio ator após confirmar email e os gates aplicam a exigência de primeira senha. Não há scan de usuários, senha provisória enviada nem autenticação por parâmetro de email.

Nota fiscal permanece **não configurada/não emitida**. Não há endpoint fiscal nem selo de emissão simulada. Sandbox, proteção Bunny efetiva e fiscal são o gate externo A14.

## Operação local

Pré-requisitos: Node24+, Deno2+, SDK instalado pelo lock do projeto, Docker e SupabaseCLI; `ffmpeg` para a fixture. Não instalar dependência automaticamente durante testes. Se SDK/Deno estiver ausente, o teste falha antes de chamar serviços.

```sh
node scripts/local.mjs status
node scripts/local.mjs start
node scripts/bootstrap.mjs --demo
node scripts/test-integrations.mjs
node scripts/test-integrations.mjs --local
node scripts/backup.mjs dump
node scripts/backup.mjs verify-restore
node scripts/local.mjs stop
```

Os scripts conferem `project_id=icarus-courses-local`, API58521 e DB58522 antes de agir. Nunca executam reset, `stop --all`, remoção de volume ou alteração de outro projeto. `start` exclui serviços dispensáveis, captura saída privada e exige saúde. `stop` identifica explicitamente o projeto e preserva volumes. O perfil TOML é local em `.local/supabase-profile.toml`, com campos públicos `name/api_url/dashboard_url/project_host`, para contornar a incompatibilidade do perfil global no CLI2.109.1; não altera HOME nem perfil global.

`status` captura JSON sem imprimi-lo e exige HTTP200 de Auth/health, Storage/status e RPC `app_public_context` através do PostgREST, antes de declarar saúde global. Escreve somente URL/anon key públicos em `.env.local`. Chave service-role fica exclusivamente em `.local/service.env`600 e valores extras do operador são preservados. Arquivos de acesso, contas e evidências privadas ficam em `.local/`700 e arquivos600; nunca commitá-los. `ICARUS_LOCAL_WORKDIR` permite apontar explicitamente a árvore de operação coordenadora; não aponta outro projeto. `start` aplica o reparo de bind antes de declarar prontidão.

Bootstrap exige `--demo`, reaproveita usuários salvos e não reseta progresso. Cria cinco contas Auth sintéticas (admin, member, pro, moderator, support), senha aleatória guardada em `.local/ACESSOS.md`600. Perfis/papéis/conteúdo são semeados somente pelo helper backend `app_local_demo`; o marcador SQL privado `app_private.local_demo_guard` é habilitado em trecho privilegiado e desligado em `finally`. Fixture MP4 cinza de8s gerada por `ffmpeg` e TXT são privados e rotulados DEMONSTRAÇÃO; nenhum arquivo existente é sobrescrito. Termos demo não habilitam cadastro/checkout real. Equipe precisa matricular/verificar MFA nativo antes de operar.

### Upload grande

1. Edge `upload`: JSON `{action:'reserve',kind:'material'|'lesson',resource_id,file_name,content_type,size_bytes}` retorna `{upload_id,bucket,path,expires_at,method:'storage'}`.
2. Browser usa seu JWT Auth em `storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type})`. Nunca recebe service-role ou token signed-upload de2h. RLS permite somente INSERT do ator/caminho reservado, estado pendente e prazo15min; sem SELECT/UPDATE livre.
3. Edge `upload`: JSON `{action:'finalize',upload_id}` reavalia ator/permissão/prazo e inspeciona bytes via Range. DB compara metadata real de tamanho/MIME antes de marcar `ready`. Recursos pendentes/incompatíveis ficam inacessíveis.

Runtime Storage e bucket foram conferidos com limite efetivo524288000 bytes. Um arquivo sintético privado real de56MiB atravessou reserva, upload JWT nativo e finalize; não foi realizado ensaio de throughput com500MiB. Expiração exige nova reserva; cancelamento não apaga objeto já recebido. Falha ou timeout de multipart consulta existência antes de cancelar registro; nunca apaga objeto legítimo para esconder falha. Signature sniffing é validação de tipo, não antivírus.

### Portas e recuperação

O CLI atual publica portas em todas as interfaces por padrão; não existe parâmetro genérico de bind API/DB no config consultado. `scripts/local-bindings.mjs dry-run` lista somente alvos de allowlist do Icarus. `apply` faz reparo pontual via DockerAPI local alterando apenas HostIp para127.0.0.1; compara profundamente Config, HostConfig, mounts e aliases, e exige saúde DB/Auth/Storage. Preserva originais parados + journal600 para rollback. Segunda aplicação com journal verifica estado e retorna `already_applied` sem recriar. Não há alteração global de Docker Desktop/firewall.

`rollback` exige todos os originais por ID e falha claramente se algum faltar; não declara restauração impossível. `finalize`, somente após autorização operacional, revalida configurações/saúde/IDs exatos de backups parados, remove exclusivamente esses containers com `v=false` e arquiva journal600. Nenhuma remoção de volume/imagem. Não executar simultaneamente a aplicação de SQL; combinar janela curta com a coordenação.

### Backup e release

Dump custom privado dos schemas `public,app_private,auth,storage,extensions`; restauração em banco novo `icarus_restore_<aleatório>` dentro do container Icarus, comparação SQL por tabela (contagem + hash das linhas ordenadas) e exclusão apenas desse destino isolado em `finally`. Não restaura sobre a origem. Escritas devem estar pausadas no pequeno intervalo dump/comparação; divergência é falha explícita. O pacote inclui também tar dos binários privados do Storage e manifesto SHA256. O ensaio restaura em diretório isolado e confere cada binário. Owners/ACLs são preservados e comparados junto de RLS/policies/default ACLs para anon/authenticated/service_role; omitir ACL no ensaio negativo causa falha apesar de linhas/binários iguais. Roles do cluster e serviços externos exigem instalação/configuração separada compatível. Retenção diária e cópia fora da máquina continuam configuração futura; veja [operação](../operations.md).

Nenhum workflow/deploy foi disparado. Para CI futuro, executar testes de contrato + Supabase local/SQL/auth/storage por se tratar de dinheiro e autorização, além de typecheck/build/frontend da coordenação. Instalar somente pelo lock, manter secrets no servidor, preservar o config `verify_jwt=false` nos handlers que autenticam manualmente, testar públicos/privados via Gateway real e validar RLS/grants no destino. Antes de deploy: aceite A14 dos fornecedores, termos/oferta reais, MFA/e-mail, backup completo e autorização de publicação. Não há comando que crie cloud ou publique automaticamente.

## Evidências desta frente

- `deno check --node-modules-dir=manual supabase/functions/*/index.ts scripts/recover-invites.ts`: handlers e recovery checados.
- `node scripts/test-integrations.mjs`:34 testes de transporte simulado aprovados; inclui config/JWT/gates/Bunny/Storage/recibo/rehash/MFA/reserva/finalize, sessão exata/headers forjados, checkout divergente, timeout sem nova cobrança, falha de persistência, outbox/convite, primeira senha nativa e compensação de upload sem apagar objeto já recebido.
- Supabase Auth/Storage/API do banco reais200; DB/API/mail127.0.0.1:58522/58521/58524 após reparo autorizado. Config/HostConfig/mount/aliases preservados, DB/Auth/Storage saudáveis, SQL após restart passou. `finalize` autorizado e executado após aceite nativo: apenas os três containers originais parados por IDs do journal foram removidos, `v=false`, nenhum volume/imagem; mesmos IDs das instâncias novas e binds127 preservados. Journal completo arquivado600.
- Segundo `local-bindings.mjs apply`: `already_applied:true`, três saúdes verdadeiras; nenhum container recriado no segundo ensaio.
- Dump e restore isolado real:67 tabelas com contagens/hashes SQL iguais depois das fixtures e testes nativos; evidência privada `.local/backups/restore-evidence.json`. O ensaio anterior também passou66 tabelas antes das fixtures.
- Bootstrap Auth real inicialmente bloqueou com500: filtro privado de diagnóstico confirmou `Cadastro público indisponível`/SQLSTATEP0001 no trigger AFTERINSERT antes de Auth confirmar email administrativo. A [fonte exata GoTrue v2.192.0](https://github.com/supabase/auth/blob/v2.192.0/internal/api/admin.go#L399) confirma que tanto app_metadata quanto confirmação são aplicados depois de INSERT. A frente backend corrigiu com profile imediato e constraint trigger diferido que relê a linha final; após migration013 aplicada, o único retry de criação passou5/5 contas. Guard local voltou para false. Não houve relaxamento do cadastro público: tentativa API real de forjar markers continuou negada.
- Compatibilidade Storage: `exists/info` do SDK2.119.2 lançou erro para objeto ausente no Storage local instalado; listagem do diretório com nome exato resolveu a detecção sem inferir ausência de erro de rede/auth. Upload não sobrescreve fixture existente; compensação só cancela reserva vazia e preserva objeto em timeout ambíguo.
- `ICARUS_LOCAL_WORKDIR=<coordenadora> node scripts/test-integrations.mjs --local`: **2 testes,9 passos,0 falhas**. Auth nativo, cadastro forjado negado, MP4 privado com bytes reais e URL pública negada, senha incorreta/correta, sessão principal preservada, multipart real, Storage nativo com ator/reserva/pending/no-overwrite/finalize, outro ator/UUID negados e equipeAAL1 negada.
- O segundo teste recebeu convite nativo no **Mailpit local**, confirmou pelo link Auth real, definiu primeira senha por Edge com PUT Auth/user + helper de sessão e comprovou login na mesma conta. Isso prova o fluxo local; não é entrega SMTP externo nem pagamento real. Vídeo conferido por `ffprobe`:8,000s. Recibo privado600 `.local/native-integration-evidence.json`, com booleans e hash da fonte, sem senha/JWT/link/hash de senha.

Não é aceite de venda, email externo, vídeo Bunny, throughput de500MiB ou SLA99,5%. Runtime e bucket500MiB foram comprovados, com upload/finalização real de56MiB. Nenhum teste externo cobrado foi executado.


### Fechamento operacional A15 (23/nov/2026)

- Gateway HTTP real: capabilities semJWT200; fornecedor Asaas/Bunny=false, media com JWT nativo200 e mesma URL Storage pública retornou Range206 com MP4 real. URL interna kong não é devolvida ao browser; origem inesperada falha fechada nos contratos.
- Upload56MiB (58720256 bytes) por JWT Auth/MFA nativos, reserva do próprio material QA, Storage privado, finalize ready e Range206; runtime/bucket524288000. Objeto/reserva/material/arquivo QA removidos no finally; recibo só é escrito após cleanup.
- R2: CHECKOUT_PAID 100% sintético entrou pelo HTTP webhook normal e chegou automaticamente ao Mailpit via background. Duplicata deixou1tentativa/1convite. Falha429 injetada somente no transporte Auth invite deixou pending durável; após backoff, workerHTTP de serviço entregou convite nativo ao Mailpit com2tentativas, pagamento preservado. Nenhuma API Asaas foi configurada ou chamada. Fixture financeira removida; contas/convites sintéticos não conferem acesso sem confirmação/primeira senha.
- Instalação isolada DB-only `icarus-courses-install-qa`, porta127.0.0.1:58622: CLI nativo instalou1..17 e depois `migration up` aplicou018. Histórico real corresponde às18fontes, sem repair/falsificação. Runner reproduzível: SQL17+109+36+16+45 e corrida real2sessões/4 =227assertions, exit0. Recibo `.local/clean-install-evidence.json` nesta worktree.
- Backup no projeto demo com escritas pausadas:67tabelas,5arquivos Storage,339checagens função/papel e201checagens tabela/papel iguais, owners/RLS/policies/default ACLs iguais. Restore negativo semACL: linhas/binários iguais, permissões divergentes e exit1 esperado. Destinos temporários removidos, origem preservada.
- Stop foi chamado duas vezes sem reset/perda de volumes. Primeiro start recriou o runtime com500MiB e binds127, mas a operação composta falhou antes de iniciar o processo Edge. A implementação anterior descartava stderr, portanto a causa interna exata não pode ser reconstruída e não é apresentada como resolvida por inferência. Após comprovar DB/Auth/Storage/API saudáveis, somente Edge foi relançado;67tabelas permaneceram idênticas antes de liberar UI. Dois `local.mjs start` normais consecutivos com stackUP passaram sem recriar containers. Não se declara que a primeira execução do ensaio composto foi verde. Logs filtrados corroboraram desconexão do canal PostgREST às05:06:34 e reload do schema cache às05:06:35; isso não reconstrói o erro descartado do processo composto. Start agora aguarda até30s pela saúde completa pós-recriação, registra estágio e preserva diagnóstico privado; novo start normal passou com estágio ready. A guarda stop foi testada com processo próprio que ignora SIGTERM: erro esperado e PID preservado, sem tocar no runtime real.
- Evidências privadas600 na árvore coordenadora: `http-media-evidence.json`, `large-upload-evidence.json`, `http-outbox-evidence.json`, `native-logout-evidence.json`, `restart-recovery.json`, `backups/restore-evidence.json`, `backups/restore-negative-acl.json`. Não contêm credenciais nos recibos; dump/tar são dados privados e não entram no Git.

### Ciclo frio e encerramento do journal técnico

O follow-up executou **um** stop/coldstart autorizado, sem reset, e uma continuação com os serviços já ativos; não repetiu o ciclo frio. A primeira chamada composta retornou exit1 na fase que inclui Edge e a saúde final: o motivo exato dessa exceção não ficou disponível no stderr genérico, portanto não é atribuído a timeout nem ao journal antigo. O recibo `cold-cycle-initial-failure.json` preserva esse resultado. No mesmo PID nativo, o primeiro HTTP200 observado ocorreu33,69s após a gravação do PID; não houve outro cold/restart para obter esse resultado. A fonte agora limita a espera Edge a90s com medição explícita; checker do recibo confirmou budget90000, ready e mesmo PID.

A continuação normal terminou saudável e finalizou somente os três backups técnicos DB/API/mail, depois de comparação profunda e Edge HTTP aprovado. Journal ativo ausente, zero desses backups restantes, nenhum volume/imagem removido. Comparação antes/depois:67tabelas idênticas, binários e ACL/RLS/owners/policies/default ACLs iguais, Config/HostConfig/mounts dos seis serviços persistentes iguais. Hostnames gerados foram vinculados aos IDs exatos arquivados do reparo, sem ignorar alterações arbitrárias. A falha inicial não é convertida em sucesso retroativo; o resultado positivo descreve preservação e recuperação do mesmo ciclo.

Edge ficou apontado para a worktree Root, com fonte das14unidades de funções conferida idêntica entre worktrees. Token Asaas sintético removido do env; capabilitiesHTTP200 informa Asaas/Bunnyfalse e webhooksemconfigHTTP503. Recibos600 na árvore Root: `cold-cycle-evidence.json`, `cold-cycle-initial-failure.json`, `cold-edge-observed.json`, `edge-readiness.json`, `ops-resource-inventory.json`; snapshots protegidos permanecem privados. A instalação QA isolada anterior foi preservada, sem alteração neste ciclo.

## Fontes verificadas

- [Asaas: criar checkout hospedado](https://docs.asaas.com/reference/criar-novo-checkout), [eventos de checkout](https://docs.asaas.com/docs/eventos-para-checkout), [link e callback](https://docs.asaas.com/docs/link-do-checkout-e-redirecionamento-do-cliente).
- [Asaas: token dedicado e persistência/idempotência de webhook](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook), [eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas), [filtro oficial checkoutSession](https://docs.asaas.com/reference/list-payments).
- [Bunny: embed token server-side SHA256 hex](https://docs.bunny.net/stream/token-authentication), [proteções distintas do player/CDN](https://github.com/BunnyWay/documentation/blob/main/stream/security.mdx).
- [Supabase: configuração CLI](https://supabase.com/docs/guides/local-development/cli/config), [logout de sessão](https://supabase.com/docs/reference/javascript/auth-admin-signout).

As assinaturas/RPCs efetivas são as de `docs/CONTRACT.md` e `docs/api.md`, da frente backend. Nenhuma regra de domínio financeira foi duplicada em script SQL desta frente.
