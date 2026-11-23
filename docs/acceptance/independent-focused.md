# Recheck independente focado — Icarus

**Sem novo defeito demonstrável nos deltas delimitados. R1–R4 resolvidos.**

Fonte inicial `d57e4c6452b60bdd2aa0b8dbc0993a298e4fd9d3`; fechamento `83980b7e37d7fe3470cd200ecc6e1b1306b20f9d`. Deltas identificados: integração `d57e4c6`, checkout UI integrado `6827672` (fonte informada `4d99b75`), Ops integrado `83980b7` (fonte informada `3ada0ce`). Somente leitura; nenhuma publicação.

## Achados anteriores

| ID | Estado | Evidência e conclusão |
|---|---|---|
| R1 | RESOLVED | requires_aal2 inclui fator verificado de membro; actor exige JWT e sessão nativa aal2 nos caminhos protegidos; service_session aplica a mesma exigência. Exceções setup/bootstrap/touch não concedem conteúdo. AccountAssurance inclui membro com nextLevel aal2. Referências: `supabase/migrations/202611230016_member_mfa.sql:2`, `supabase/migrations/202611230016_member_mfa.sql:13`, `supabase/migrations/202611230016_member_mfa.sql:21`, `src/auth.tsx:175`. Prova: fonte e testes frontend executados; SQL focado inspecionado, não reexecutado por este reviewer. |
| R2 | RESOLVED | Webhook persiste antes de iniciar deliverPaidInvite em waitUntil. Claim/lease bloqueiam concorrência; sent não significa conta confirmada; falha definitiva fica pending com backoff, ambígua uncertain sem reenvio automático. Consumidor service-only processa lote devido. Recibo agora comprova o encadeamento HTTP ao Mailpit e retry nativo, não apenas password-setup isolado. Referências: `supabase/functions/asaas-webhook/index.ts:14`, `supabase/functions/_shared/payment.ts:55`, `supabase/functions/process-invites/index.ts:4`, `supabase/migrations/202611230017_payment_invitation_outbox.sql:16`. Prova: fonte, 34 contratos executados e recibo nativo HTTP sanitizado inspecionado; nativo não reexecutado por este reviewer. |
| R3 | RESOLVED | Callback usa /pedido/{id}, correspondente a OrderStatus; o teste de contrato verifica a URL emitida. Referências: `supabase/functions/checkout/index.ts:20`, `src/main.tsx:171`. Prova: fonte, teste de contrato executado e roteador conectado. |
| R4 | RESOLVED | Celular vazio/ausente segue como string vazia no DTO e é omitido do payload Asaas; validação de formato só para valor presente, alinhada à UI opcional. Referências: `supabase/functions/checkout/index.ts:12`, `src/pages/checkout.tsx:147`. Prova: fonte e teste de contrato executado. |

## Deltas conectados

- **verify_jwt manual: sem defeito novo demonstrado.** Config declara false para nove handlers. capabilities retorna somente flags públicas; checkout/order-status chamam actor opcional e têm suas próprias verificações; webhook exige token dedicado; process-invites compara bearer à chave de serviço; media/upload/reauthenticate/password-setup exigem actor, Auth/session e gates SQL. Não confundir gateway sem verificação automática com handler sem autorização.
- **URL assinada Storage interna para pública: sem defeito novo demonstrado.** publicStorageUrl exige origem igual ao SUPABASE_URL e prefixo privado de URL assinada; destino vem da configuração, sem userinfo/path/query/hash e com HTTPS, salvo loopbacks locais exatos. Mantém path/query e token; consumidor media usa o helper após gate. Contrato positivo/negativo passou.
- **nonce FK e logout: sem defeito novo demonstrado.** 018 faz cascade somente do nonce efêmero para app_sessions, já dependente da sessão Auth; não toca auditoria. signOut só limpa cache após sucesso e rejeita erro nativo. Recibo sanitizado registra global logout204 em dois casos com nonce removido, auditoria e outra sessão preservadas.
- **CSV das duas listas: sem defeito novo demonstrado.** Somente profiles/orders expõem ação; leitura usa app_admin_list existente e seus gates. Colunas whitelist excluem documentos/tokens, células neutralizam prefixos de fórmula e aspas, paginação verifica total/IDs e falha sem entregar arquivo parcial; limite5000 explícito. Testes cobrem múltiplas páginas e falha intermediária.
- **Form preparado e erro de logout: sem defeito novo demonstrado.** Revisar alteração usa successMessage de preparação; mutação continua dependente de confirmação server-side. Logout com500 não declara sucesso nem descarta sessão, conforme teste focado.
- **parcelamento UI para Edge: sem defeito novo demonstrado.** Cartão oferece1..12; serialização Pix força1 mesmo após selecionar12 no cartão. Edge mantém integer1..12 e Pix1, envia INSTALLMENT com máximo selecionado apenas quando >1. Três testes atuais passaram; nenhuma captura local de cartão ou simulação de taxa inventada.
- **backup ACL nomeado pelo coordenador: RESOLVED.** pg_dump/restore normais preservam owners/ACLs, sem --no-owner/--no-privileges; flag de omitir ACL é exclusiva do ensaio negativo. protections compara EXECUTE efetivo por assinatura/role, tabela/role e owner/RLS/forceRLS, policies e ACLs padrão dos schemas selecionados. Recibos positivo e negativo conferidos; não reexecutei restore.

## Verificações executadas neste recheck

- `node scripts/test-integrations.mjs`: **34 passed, 0 failed**; fonte `d57e4c6`. transporte simulado sem rede/DB; hashes das fontes/teste envolvidos inalterados no HEAD final.
- `npx vitest run src/admin-export.test.ts src/logout.test.ts src/frontend.test.tsx`: **26 passed, 0 failed**; fonte `d57e4c6`. frontend focado; hashes correspondentes inalterados no HEAD final.
- `npx vitest run src/checkout.test.tsx`: **3 passed, 0 failed**; fonte `83980b7`. cartão2x/12x e troca cartão12x para Pix1.

## Recibos nativos inspecionados, sem reexecução

- R2: `.local/http-outbox-evidence.json`, `passed=true`, HTTP paid→background→Mailpit=true, duplicata sem reenvio=true, retry nativo=true, duas tentativas e sem cobrança extra=true.
- Logout: `.local/native-logout-evidence.json`, dois casos HTTP204; nonce removido, auditoria e outra sessão preservadas=true.
- Backup: `.local/backups/restore-evidence.json`, 67 tabelas, 339 pares função/papel, 201 pares tabela/papel, uma policy e cinco arquivos; rows/permissions/storage_binaries_match=true.
- Controle negativo `.local/backups/restore-negative-acl.json`: linhas e binários iguais, **permissions_match=false**. O script falha explicitamente nesse resultado; saída1 esperada consta da evidência documental. O defeito de ACL nomeado pelo coordenador está corrigido na fonte final examinada, não reapresentado como achado novo.

## Limites

- Recibos nativos lidos por whitelist de booleanos/contagens; não foram lidos dumps, senhas, tokens ou hashes Auth. Recibos não trazem hash de fonte no próprio JSON; atribuição é à execução registrada pelos caminhos, não prova de identidade binária do runtime com todo o HEAD.
- Não executei SQL/DB mutante, runtime/start/build global, envio/cobrança externa, deploy ou publicação.
- UAT visual/nativa de MFA Pro ainda em finalização pela frente própria; este recheck não a transforma em aprovada.
- Recibo HTTP R2 é financeiro sintético + Auth/Mailpit nativos locais. Não homologa Asaas real, SMTP externo, credenciais de produção ou primeira venda.
- Retenção/cópia fora da máquina e ativação operacional de worker continuam preparação operacional própria; não reabrir escopo de produto por esses itens.
- Fonte final inspecionada 83980b7, nenhuma conclusão sobre mudanças posteriores.

## Hashes dos arquivos

O JSON acompanhante contém SHA256 de **39 arquivos** rechecados e consumidores/testes. Entre a coleta inicial e a final, somente `src/pages/checkout.tsx` mudou nesse conjunto inicial; seu delta e os três testes novos foram conferidos em `83980b7`.

| Arquivo principal | SHA256 |
|---|---|
| `supabase/migrations/202611230016_member_mfa.sql` | `acdb233cef1a8d150f1b07baae8c5d91ae2a1c547141973676b1ffa5004c339a` |
| `supabase/migrations/202611230017_payment_invitation_outbox.sql` | `ba716c919583be5653d30cb653ffe9bf7b4d5b7ee0fba0436b97b2feb66d84d7` |
| `supabase/migrations/202611230018_reauth_nonce_session_cascade.sql` | `9f112efbec953dd97e48371753c462e1b06e89727b42ffad2aedea4745dff954` |
| `supabase/functions/asaas-webhook/index.ts` | `5ea873f67f857839e855824a61f3abd0c91a4bbbbf63724196e52453e517985f` |
| `supabase/functions/_shared/payment.ts` | `83c2c3cb2a33c885ffda35bf43f0a0d82a5a7b32452ab33165d536915905baad` |
| `supabase/functions/_shared/storage.ts` | `86b015b45bf5dac688152adb69be9056152fc529e27e851884951e164667e23c` |
| `supabase/config.toml` | `b3346c69432be1850f9522f680d06dfc8cf3b8e5a925d1231a509fbad37af311` |
| `scripts/backup.mjs` | `404e905250df12edd6e613a0224be8814d9424405f6d31216861935f15cefd83` |
| `src/pages/checkout.tsx` | `8db0ac432646f044d367dbac9cbd9a75a39282972dcc7639c3b58ca7099ee517` |

O recheck delimitado termina aqui; nenhuma necessidade de novo ciclo amplo foi demonstrada.
