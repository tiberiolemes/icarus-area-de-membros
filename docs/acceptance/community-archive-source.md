# Arquivar e restaurar a própria publicação: fonte

23/11/2026, base `839168b`, versão de origem 0.1.5. Entrega finita do contrato `docs/implementation/community-archive.md`; não amplia as áreas principais. Este recibo cobre fonte e verificações isoladas, ainda sem integração, publicação ou aceite visual.

## Mudança e consumidores

- Migration incremental 20 cria `app_archive_post(uuid,boolean)` e marcadores privados `archived_by`/`archive_source`. Apenas titular com sessão e acesso vigente ao espaço arquiva `pending/approved/rejected` e restaura o próprio arquivo ao estado anterior permitido. Legado sem origem, operação administrativa, `hidden/removed` e estado anterior inválido não liberam restauração. `archive_source` também distingue a operação administrativa quando admin e autor são a mesma pessoa.
- RPC faz lock, transição e auditoria na mesma transação. Retry da mesma operação concluída não duplica auditoria. Mantém identidade, conteúdo, imagem, criação, respostas e votos. Apenas `authenticated` executa a RPC nova; PUBLIC, anon e service_role sem EXECUTE. RLS/grants de tabela e helpers privados permanecem fechados.
- O DTO final de `post_json` mantém avatar, imagem, contadores e campos existentes; acrescenta capacidades do servidor e alinha `can_edit=false` em `archived/removed`. `app_post`, feed e lista administrativa já consomem esse DTO. O feed mantém o acesso do autor a estados próprios e não expõe arquivo a outro membro.
- O único ramo alterado de `app_admin_archive` é posts: registra ator/origem administrativa inclusive em re-arquivamento sobreposto. As outras oito entidades, exigência de papel, consumo do nonce e auditoria continuam iguais.
- `visible_target`, usado por votos e denúncias, agora exige parent aprovado também para respostas. `app_reply`, reserva e finalização de imagem serializam com a linha do post. A finalização verifica o gate depois da trava; upload pendente não reabre arquivo nem substitui sua imagem. Leitura da imagem pronta existente conserva o gate.
- PostPage confirma sem nova senha, usa Modal/Form existentes, bloqueia reenvio e fechamento durante escrita, apresenta erro/retentativa, fecha no sucesso e devolve foco ao controle estável ou à publicação quando a capacidade desaparece. A intenção aberta não troca de arquivar para restaurar durante refetch. Atualiza detalhe e invalida feed após sucesso, sem status otimista; rejeitado/pendente não são anunciados como aprovados. Respostas arquivadas permanecem legíveis sem ações de interação. Ajuda e tour acompanham o fluxo.
- Modal ganhou apenas `open`/`onOpenChange` opcionais; consumidores existentes continuam sem controle externo. Sem dependências, estilos, configurações, runtime ou outras migrations alteradas.

## Provas executadas

| Check | Resultado |
|---|---|
| `npm exec vitest run src/community-archive.test.tsx` | 8 testes passaram, 1 arquivo, 1,16 s |
| `npm run typecheck` | saída 0 |
| SQL composto, migrations 19 + 20 + `supabase/tests/post_archive.sql` | 86 asserts passaram, saída 0 e `ROLLBACK` |
| Conferência após rollback | histórico termina em 18; 0 colunas novas; 0 RPC nova; 0 fixtures remanescentes nas relações verificadas |

Frontend usa transporte controlado e cobre capacidades falsas, cancelamento sem escrita/invalidação, foco, duplo submit, bloqueio durante escrita, erro/retentativa, restauração rejeitada, capacidade revogada e intenção preservada, além de Modal sem controle externo. SQL chama RPCs com papéis anon/authenticated/service_role e fixtures Auth/sessões revertidas; cobre autor A/B, grants, estados, acesso/suspensão/sessão, idempotência/auditoria, preservação, arquivo administrativo sobreposto inclusive admin=autor, leitura histórica, interações negadas/permitidas e falha de auditoria com rollback da transição.

Destino SQL inspecionado sem ambiente/credenciais: container exato `supabase_db_icarus-courses-install-qa`, imagem `public.ecr.aws/supabase/postgres:17.6.1.143`, bind DB `127.0.0.1:58622`, volume próprio. O histórico QA terminava em 18; a coordenação autorizou compor temporariamente 19+20 e teste dentro de um BEGIN externo, retirando apenas seus delimitadores externos. Nenhum COMMIT interno, escrita de migration history, reset ou aplicação persistente. O DB demo 58522 não foi utilizado.

Recibos privados em `.local/` desta worktree, modo 600: `qa-identity.log`, `frontend.log`, `typecheck.log`, `sql.log`, `rollback.log`, `post-archive-composed.sql` e `sql-inputs.json`. Não contêm senhas/tokens. Hashes SHA-256 dos inputs executados:

| Fonte | SHA-256 |
|---|---|
| migration 19 | `67d22427dc69fedc2429b9185962b753fd0472fdd84628e358c81f69d432a90f` |
| migration 20, após SRC-01 | `2b3cbb45f9dbf4bcc7cb75fad968de6b644d881ea9bdd659b865317a7f0a9666` |
| teste SQL | `639155d3712cc533b78af4695d086a58f9e26145b64679fa474b77b1ad616165` |
| SQL composto, após SRC-01 | `3f3fa5d510daba4de98cf03442ddbe6e87242bbfb13cafac5c113e2257ec7323` |

A revisão independente encontrou SRC-01: a suspensão mantém perfil→sessão, enquanto actor() já mantém a sessão e a FK/auditoria do arquivo procura o perfil. A migration20 agora obtém `FOR KEY SHARE NOWAIT` no próprio perfil após actor() e antes do post; indisponibilidade da trava vira P0001 recuperável em PT-BR e aborta a chamada, liberando a sessão. Não remove FK, validação, MFA, grants, titularidade ou auditoria e não modifica a operação administrativa. Guarda sem espera evita introduzir nova aresta de espera perfil←sessão; não é prova executada da corrida real.

Após esse delta passaram novamente somente os mesmos 86 asserts SQL em composição 19+20+teste e ROLLBACK no QA exato. Histórico permaneceu em 18, zero colunas/RPC/fixtures novas; recibos privados600 `src01-identity.log`, `src01-sql.log`, `src01-rollback.log`, `src01-inputs.json` e `src01-composed.sql`. Nenhum TS mudou, portanto frontend/typecheck não foram repetidos. As duas ordens de arquivo versus suspensão, incluindo interleaving forçado, ficam para o runner e execução posterior da coordenação.

## Locks e limites

`app_archive_post` usa `FOR UPDATE` no próprio post antes de validar estado/transição; a atualização administrativa também trava essa linha. `app_reply`, `visible_target` e reserva de imagem usam `FOR SHARE` no parent antes de verificar estado e escrever; finalização trava o upload e depois o post com `FOR UPDATE` antes do gate e da vinculação. Todas as travas duram até o fim da transação. Assim, interações iniciadas antes do arquivo terminam antes dele, e as que chegam depois revalidam o estado já arquivado.

Não houve corrida real entre duas sessões executando RPCs novos: o ALTER TABLE revertido mantém ACCESS EXCLUSIVE até ROLLBACK e a nova função não fica visível a outra sessão. Repetição sequencial e sobreposição administrativa foram provadas, sem chamá-las de concorrência. A coordenação confirmou que fará a corrida após aplicação incremental autorizada no QA isolado.

Permanecem para a Root: revisão independente, backup/aplicação incremental, corrida real, HTTP e navegador afetados com fixtures próprias, teclado/foco nativo, 360 px e dois temas, além da decisão de publicação. Não foram executados build global, suíte frontend inteira, Vite, UAT global, providers externos ou produção. Mantidos componentes/tokens Icarus existentes; validação visual desta mudança ainda pendente. Não houve execução de CI nem abertura de PR, portanto consumo de runner nesta frente: zero; não há economia de CI medida a alegar.
