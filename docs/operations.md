# Instalação e operação do Icarus

Fonte MIT React/Vite + Supabase. Uma academia, sem fornecedores externos configurados nesta entrega. Os comandos abaixo operam o projeto local `icarus-courses-local` nas portas58521/58522/58524; não criam conta cloud, não publicam, não executam cobrança e não reiniciam outro projeto. A instalação futura no servidor exige domínio/TLS, SMTP e secrets próprios antes da homologação externa; CLI de desenvolvimento não constitui, sozinho, deploy de produção.

## Instalação nova

1. Instalar Node24+, Docker, SupabaseCLI compatível com o config e Deno2. Instalar dependências com `npm ci`; não reaproveitar dados da base descartada.
2. Rodar `node scripts/local.mjs start`. Em volume **novo**, o CLI nativo inicializa Supabase e aplica as migrations fonte com histórico real. O script restringe portas a127.0.0.1 e só declara pronto após Auth/Storage/RPC pública/Edge HTTP saudáveis. Depois dessas verificações, finaliza somente as cópias técnicas DB/API/mail criadas pelo reparo de bind: compara configurações e IDs, remove os backups parados sem volumes/imagens e arquiva o journal600. Outros containers parados são preservados. Assim, stop seguido de start não reutiliza um journal de IDs anteriores; falha antes da prontidão preserva essas cópias para recuperação.
3. Executar `node scripts/test-db.mjs`: SQLs assert/rollback com `psql -v ON_ERROR_STOP=1`, saída privada600, somente exit/denominadores no terminal. O script usa Docker local padrão, funciona em Linux/macOS e não exige configuração global do Docker Desktop.
4. Rodar `npm run dev` e abrir explicitamente `http://127.0.0.1:8088`. Essa é a origem CORS padrão. Outro hostname exige configurar `APP_ORIGIN` **exato** no servidor; não derivar do header Host nem usar `*`.

Não executar `db reset` para retomar instalação existente. O demo de construção que recebeu DDL manual não tem histórico CLI fabricado: o ensaio `scripts/clean-install.mjs` usa um banco novo isolado, uma bridge própria com default bind127 e migrations aplicadas nativamente; o recibo distingue esses ambientes. `migration repair --status applied` não é usado como prova de execução.

## Primeiro administrador sem conteúdo demo

Não usar `bootstrap --demo` para administrador real. As migrations/seed padrão não criam usuário, preço, curso ou oferta comercial. Após `start` criar `.local/service.env`600:

```sh
node scripts/first-admin.mjs invite email-do-responsavel
```

O operador informa o destino deliberadamente. O script usa Auth Admin nativo para criar conta **não confirmada**, com markers exclusivos de app_metadata e `password_setup_required=true`; nenhuma senha é fornecida, conhecida, impressa ou enviada. O Auth pode gerar internamente uma credencial aleatória. O convite nativo vai para o SMTP configurado, que no ambiente entregue é Mailpit local. SDK200 não comprova recebimento externo.

O titular abre o convite recebido, confirma email, define sua própria senha pela Edge `password-setup`, conclui onboarding e matricula/verifica MFA TOTP nas configurações de segurança. O operador então executa:

```sh
node scripts/first-admin.mjs promote
```

Essa ação é SQL privilegiado **específico para o ID salvo em `.local/first-admin.json`**, sem RPC pública de papel. Só promove se a conta não for demo/suspensa, tiver email confirmado, primeira senha concluída e fator MFA nativo verificado. Demais usuários não conseguem editar role pelo perfil. Ações administrativas continuam exigindo JWT/sessãoAAL2; não existe bypass por email ou marker no user_metadata. O arquivo privado do operador não deve ser commitado.

## Edge Functions e secrets

`start` gerencia um processo nativo `supabase functions serve`, registrado por PID/fonte em `.local/`, e log privado600. `functions-restart` reinicia somente esse processo. `stop` encerra exclusivamente o processo registrado e o projeto Supabase exato, preservando volumes. `status` não reescreve arquivos cujos bytes são iguais, preservando mtime para não recarregar Vite. Após recriação nativa, start aguarda até30s pela saúde Auth/Storage/PostgREST; `.local/start-evidence.json` registra o estágio e `.local/command-failure.json` preserva diagnóstico privado em caso de falha. O log Edge é aberto em append600. Se o processo registrado não encerrar após SIGTERM e3s, stop falha e preserva o PID, sem SIGKILL ou falsa declaração de encerramento.

A espera HTTP do Edge é limitada a90s e registra duração, PID, fonte e resultado em `.local/edge-readiness.json`. O start só finaliza as cópias técnicas após Edge e saúde global aprovados. Falha mantém journal/backups para recuperação explícita; não apagar o journal para esconder uma falha e não iniciar outro ciclo frio às cegas.

`.env.local` contém somente `VITE_SUPABASE_URL` e a anon key pública. `.local/service.env`600 contém credenciais de operação; `.local/edge.env`600 contém somente configuração server-side das funções. O CLI fornece os secrets reservados `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ao runtime. Não colocar service-role, Asaas, Bunny ou senha em variável VITE/browser.

Configuração Edge local mínima:

```dotenv
APP_ORIGIN=http://127.0.0.1:8088
ICARUS_MODE=local
ICARUS_PUBLIC_SUPABASE_URL=http://127.0.0.1:58521
```

Em runtime hospedado pode ser usado `SUPABASE_PUBLIC_URL=https://dominio-publico`. O alias `ICARUS_PUBLIC_SUPABASE_URL` evita o prefixo reservado pelo CLI local. O cliente server usa `SUPABASE_URL` interno; URLs assinadas devolvidas ao browser têm apenas a origem trocada para a pública configurada, somente quando a origem original é a API interna conhecida e o caminho é Storage privado assinado. Path/query permanecem íntegros. Origem inesperada falha fechada. Nunca imprimir o token/query de uma URL assinada.

O config declara `verify_jwt=false` para os handlers que fazem autorização própria: capabilities/checkout guest/recibo/webhook precisam chegar sem JWT; media/upload/reauth/password-setup exigem Auth `getUser/getClaims` e gates de sessão/recurso; process-invites aceita exclusivamente a credencial de serviço. Desativar o gateway não torna a mídia pública. As provas HTTP positivas/negativas ficam no relatório de aceite.

Asaas/Bunny ficam desligados sem credenciais. Checkout de produção continua indisponível até homologação. Nota fiscal não configurada, nenhum documento simulado. Domínios/referrers/arquivos originais do Bunny exigem validação externa própria.

## Convite automático pós-pagamento

Webhook persiste pagamento antes do HTTP200 e agenda o consumidor com `EdgeRuntime.waitUntil`. A outbox tem claim exclusivo, lease, tentativas e retry; sucesso do envio significa `sent`, sem confundir com confirmação de email, primeira senha ou acesso concedido. Falha definitiva sem envio volta a pending com backoff. Timeout/falha ambígua vira `uncertain`, sem reenvio automático cego; reconciliação reavalia `auth.users.invited_at`.

O worker `/functions/v1/process-invites` usa somente credencial de serviço e lê no máximo20 registros devidos. Pode ser invocado por cron do próprio servidor, sem senha/token em argumentos ou logs:

```cron
* * * * * cd /caminho/icarus && /caminho/node scripts/process-invites.mjs >> .local/invite-worker.log 2>&1
```

Criar o log600 antes de ativar cron. O cron local não foi instalado no sistema durante esta tarefa. O script lê o arquivo privado e imprime somente contador ou falha segura. Nenhum retry gera cobrança. Recuperação por pedido usa `recover-invites.ts`, com o mesmo claim, sem furar lease/estado sent/uncertain.

## Backup completo mínimo da aplicação

Pausar escritas por uma janela curta, capturar SQL **e** binários Storage:

```sh
node scripts/backup.mjs dump
node scripts/backup.mjs verify-restore
```

O primeiro comando produz `.local/backups/icarus.dump`, `icarus-storage.tar.gz` e manifesto de hashes600. O dump preserva owners e ACLs (REVOKE/GRANT); não usar `--no-privileges` no dump ou restore. O segundo restaura SQL em banco novo isolado e binários em diretório temporário isolado, compara contagens/hashes SQL, conteúdo binário, owners, RLS, policies, default ACLs e privilégios efetivos de todas as funções/tabelas dos schemas public/app_private/auth/storage para anon/authenticated/service_role. Preserva a origem e remove somente os destinos QA criados. O teste negativo `verify-restore --omit-acl-negative` deve falhar mesmo com linhas/binários iguais, comprovando que a guarda detecta a perda de grants.

O pacote contém aplicação/Auth/Storage/extensions e histórico nativo quando existente; não inclui serviços externos nem configuração/roles do cluster Supabase. O restore exige cluster Supabase compatível, roles nativas já criadas e operador `supabase_admin` privilegiado para preservar ownership/ACL. Não substituir roles nem afrouxar default privileges para fazê-lo passar. Para servidor futuro, manter também uma cópia criptografada separada dos secrets/configs e executar o mesmo ensaio de restauração com imagens/roles compatíveis.

Replay real deve ocorrer somente em destino novo isolado: instalar a mesma versão Supabase para criar roles/extensions, restaurar o dump sem sobrescrever origem, preencher o volume Storage do destino com o tar validado e apontar a API do destino. Não extrair o tar sobre o volume demo atual durante um ensaio. Comparar manifesto e `storage.objects` antes de liberar leituras; validar Auth/URLs e migrar para schema posterior só depois do restore.

Retenção, cópia fora da máquina, monitoração e SMTP externo são configuração operacional futura. Um ensaio local não prova backup diário/7dias, uptime99,5% ou homologação de fornecedores.
