# Instalação e operação do Icarus

O Icarus é uma plataforma de área de membros e cursos online em React/Vite e Supabase, com licença MIT. Cada instalação atende uma organização. Os comandos de desenvolvimento usam o projeto Docker `icarus-courses-local` e as portas `58521` (API), `58522` (Postgres), `58524` (Mailpit) e `8088` (Vite). A instalação hospedada exige domínio, TLS, SMTP, configuração e credenciais próprias.

## Atualizar de versão

Cada versão nova sai como Release no GitHub, com as notas no [CHANGELOG](../CHANGELOG.md). A atualização aplica só as migrations novas sobre o histórico existente, publica as Edge Functions da mesma tag e gera o frontend de novo. Faça backup e ensaie numa cópia antes. Numa instalação hospedada, siga [Aplicar migrações no Supabase hospedado](#aplicar-migrações-no-supabase-hospedado). Para Linux com Docker, use o [roteiro da v0.1.6](#atualizar-uma-instalação-docker-completa) ou o [roteiro a partir da v0.2.0](#atualizar-o-stack-docker-a-partir-da-v020).

| Versão instalada | Histórico esperado | Migrations a aplicar |
| --- | --- | --- |
| 2.7.0 | `202611230001` a `202611250009` | `202611260001`, `202611260010` e `202611260011` |
| 2.5.1 | `202611230001` a `202611250005` | `202611250006` a `202611250008` |
| 2.5.0 | `202611230001` a `202611250004` | `202611250005` a `202611250008` |
| 2.4.0 | `202611230001` a `202611250003` | `202611250004` a `202611250008` |
| 2.3.0 | `202611230001` a `202611250002` | `202611250003` a `202611250008` |
| 2.2.2 ou 2.2.3 | `202611230001` a `202611250001` | `202611250002` a `202611250008` |
| 2.2.1 | `202611230001` a `202611230040` | `202611250001` a `202611250008` |
| 0.2.0 | `202611230001` a `202611230038` | `202611230039`, `202611230040` e `202611250001` a `202611250008` |
| 0.1.6 | `202611230001` a `202611230020` | `202611230021` a `202611230040` e `202611250001` a `202611250008` |

A `202611250004` cria os módulos da plataforma com todos ligados; depois da atualização, nada muda até um admin desligar um módulo em Configurações → Módulos. A `202611250005` cria três RPCs de leitura e registro do painel (denúncias e pedidos LGPD) e reserva a identidade de quem denunciou para administradores, inclusive na listagem genérica. A migration não cria tabelas nem altera dados. A `202611250006` adiciona as RPCs do painel e permite arquivar episódios, preservando os registros existentes. A `202611250007` ajusta as permissões da fila de comentários, registra as exportações CSV feitas pela tela de Membros ou Pedidos e pagina os eventos de auditoria antes de montar os rótulos quando a busca está vazia. A `202611250008` registra somente se a busca foi preenchida e limita a 10 exportações por minuto por administrador, somando as duas telas. O painel gera o arquivo após a confirmação do registro na auditoria.

Na atualização da 2.7.0, a `202611260001` habilita o Vault para as integrações e marca os pedidos existentes como Sandbox. A `202611260010` trata retenção, limites e assinatura de certificados. A `202611260011` habilita a edição do vídeo e a reordenação no painel. Aplique as três antes de publicar o frontend e as funções `capabilities`, `checkout`, `asaas-webhook`, `media` e `reauthenticate` da mesma versão. As variáveis existentes têm prioridade. O interruptor de cobranças em Produção começa desligado.

A retenção elimina contadores de mais de dois dias, nonces expirados e sessões encerradas. Quando o projeto já tem `pg_cron`, o serviço executa a limpeza diariamente. Nas demais instalações, a renovação de sessão por atividade amostra lotes curtos e usa um lock que desiste se outra sessão estiver limpando. O histórico em `audit_events` é mantido.

Publique também as Edge Functions da tag:
- na 2.4.0, `upload` passou a receber a logo, o ícone e a assinatura do certificado (`kind=brand-asset`) e a gravá-los no bucket público `icarus-brand`, criado pela `202611250003`;
- na 2.2.2, `checkout` e `reauthenticate` passaram a limitar tentativas, a `checkout` confere o Turnstile e todas exigem `APP_ORIGIN` em produção;
- na 2.2.1, `upload` passou a recusar foto de perfil fora de JPG ou PNG de até 500 KB, e `reauthenticate` confere a senha com a chave de serviço.

Antes de publicar, confira se `APP_ORIGIN` e `ICARUS_MODE` estão nos secrets das Edge Functions. Se o frontend já usa `VITE_TURNSTILE_SITE_KEY`, o desafio aparece no checkout da 2.2.2, mas só vale depois que `TURNSTILE_SECRET_KEY` estiver nos secrets. Grave esse segredo por último (veja [Edge Functions e secrets](#edge-functions-e-secrets)). Revisões não lançadas do `main` que usavam tabelas com prefixo `ica_` não seguem este caminho.

Admins veem no painel o aviso "Versão X disponível" quando sai uma Release maior que a instalada. Para isso, o navegador do admin consulta `https://api.github.com/repos/<dono>/<repositório>/releases/latest` no máximo uma vez a cada 24 horas, guardando a resposta no `localStorage`. A consulta não leva dados de membros, cursos ou configuração. Como em qualquer chamada do navegador a outro site, o GitHub recebe o IP, o navegador e o domínio do painel (cabeçalhos `Origin` e `Referer`). Uma resposta de erro do GitHub, como a do limite de requisições, também fica guardada por 24 horas, para o painel não repetir a consulta a cada recarga. Sem rede, com a consulta bloqueada ou interrompida, nada chega ao GitHub e o painel tenta de novo na próxima abertura. O repositório padrão é o oficial, `tiberiolemes/icarus-area-de-membros`. Para acompanhar outro, gere o build com `VITE_ICARUS_UPDATE_REPO=dono/repositório`; com a variável vazia, o aviso fica desligado e nada é consultado. O Icarus não publica uma Content Security Policy própria. Se o seu servidor definir uma, inclua `https://api.github.com` em `connect-src`. Com a consulta bloqueada, sem rede ou no limite de requisições do GitHub, o aviso só não aparece.

## Requisitos do Docker dedicado

Execute o instalador em uma máquina ou VM Linux de teste reservada. Use Docker Engine estável da série **29.x**, a partir da **29.10.0**, e a distribuição oficial completa do Supabase CLI **2.109.1** no PATH. O Docker 28.0 corrigiu o alcance de portas de loopback no segmento L2 e o 28.3.3 corrigiu a exposição após recarga do firewalld (CVE-2025-54388). A série 28 está fora da manutenção upstream. O preflight confere o Linux, a versão estável e a identidade do daemon. [Publicação de portas](https://docs.docker.com/engine/network/port-publishing/) · [Correção no Docker 28.3.3](https://docs.docker.com/engine/release-notes/28/#2833) · [Ramos mantidos pelo Moby](https://github.com/moby/moby/blob/master/project/BRANCHES-AND-TAGS.md#docker-engine-branches) · [Docker 29.10.0](https://docs.docker.com/engine/release-notes/29/#29100).

Use um daemon próprio, com armazenamento próprio e acesso exclusivo. No provisionamento, confirme que o firewall do Docker está ativo, a bridge IPv4 usa NAT, o daemon deixa o roteamento direto desativado e a VM dispensa encaminhamento externo dessas portas. O instalador cria a bridge IPv4 com NAT e loopback e verifica os mapeamentos efetivos. Para cada ensaio novo, parta de um checkout limpo e de um daemon sem containers, inclusive parados, volumes ou redes próprias. Imagens em cache são permitidas. Use ambientes separados para o stack completo e o QA DB-only. [Bridge, NAT e filtragem no Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

Use o binário principal `supabase` do pacote oficial. Configure `supabase-go` somente como componente do pacote, conforme a distribuição. O instalador desativa o envio de telemetria do CLI via ambiente. O start usa o CLI e o upgrade do QA usa o `psql` do Postgres verificado. [Distribuição do CLI](https://github.com/supabase/cli/releases/tag/v2.109.1).

Exponha o daemon reservado por um socket Unix real chamado `icarus-install.sock`, em um diretório real do usuário com permissão `0700`. Confirme o nome do daemon, a origem do socket e seu diretório de dados durante o provisionamento da VM. O instalador compara o ID declarado com o ID lido no daemon e usa o mesmo socket para Docker, Supabase e testes. Um contexto, um alias de socket ou a ausência de containers em execução são insuficientes para comprovar a reserva.

```sh
export ICARUS_INSTALL_DOCKER_HOST=unix:///caminho/privado/icarus-install.sock
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH DOCKER_API_VERSION
export DOCKER_HOST="$ICARUS_INSTALL_DOCKER_HOST"
export ICARUS_INSTALL_DOCKER_ID="$(docker --host "$DOCKER_HOST" info --format '{{.ID}}')"
```

Consulte o inventário desse daemon antes do ensaio com `docker container ls -a`, `docker volume ls` e `docker network ls --filter type=custom`. Confirme as portas TCP livres na VM. Para o stack completo, use API em 58521, Postgres em 58522 e `[local_smtp]` ativo em 58524. Portas SMTP/POP3 adicionais, TLS da API e pooler ficam desativados nesse perfil. O instalador confere o TOML e sonda as portas antes de criar recursos e repete o inventário antes do start. O CLI pode parar e limpar recursos pelo label do projeto se o start falhar. Preserve a exclusividade do daemon e das portas até o instalador terminar. [Implementação do Supabase CLI 2.109.1](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/internal/utils/docker.go#L96-L145).

### Recuperar um lock interrompido

O erro informa o caminho `icarus-install.sock.lock` e o PID quando disponível. Leia `owner.json` no diretório indicado. Compare PID, comando e horário com o processo da VM. Preserve o lock enquanto o dono, um subprocesso do CLI/Docker ou uma operação do ensaio puder estar ativo. Para upgrade, use o daemon dedicado e o ID do registro de QA para consultar `pg_stat_activity` e confirmar que nenhuma sessão `icarus-qa-upgrade` permanece. Se a interrupção ocorreu antes de gravar o dono, confirme que a VM está exclusiva e que todos os processos do ensaio terminaram.

Somente após essas confirmações, remova o `owner.json` desse lock, se presente, e use `rmdir` no diretório exato. Confira o histórico e os logs da tentativa antes de repetir. Preserve as instalações, os recibos e o restante de `.local`.

## Instalação nova

1. Extrair o archive da tag pretendida ou clonar o checkout correspondente. Na raiz com `package-lock.json`, instalar Node.js 24+, npm e executar `npm ci`. Para testes, instalar também Deno 2 e Python 3. A demonstração opcional usa `ffmpeg` com `libx264`.
2. Rodar `node scripts/local.mjs start` com a declaração do Docker dedicado. O CLI nativo cria o banco e aplica as migrations com histórico real. A bridge nasce com publicação padrão em loopback. O script confere a rede, os IDs e os bindings efetivos antes de acessar o stack e só declara pronto após Auth, Storage, RPC pública e Edge responderem. Nas próximas partidas e paradas, opera apenas os IDs registrados. Em falha antes de registrar os IDs, preserve os diagnósticos e provisione outro ambiente vazio para um novo ensaio.
3. Executar `npm run test:db`. O runner usa `psql` e Python 3 para os SQLs de asserção/rollback e a corrida da outbox. A saída detalhada fica privada em `.local/test-db/`. A execução imprime somente status e contagens. As corridas especializadas de comunidade, certificado e lançamentos têm destinos e fixtures de QA próprios.
4. Rodar `npm run dev` e abrir explicitamente `http://127.0.0.1:8088`. Essa é a origem CORS padrão. Outro hostname exige configurar `APP_ORIGIN` **exato** no servidor; não derivar do header Host nem usar `*`.

### Atualizar uma instalação Docker completa

Use este roteiro para o stack completo da v0.1.6 criado pelo Supabase CLI, com API em `58521`, Postgres em `58522` e Mailpit em `58524`. O instalador da versão nova exige um daemon vazio na primeira partida. Neste roteiro, o stack existente continua sob o controle dos comandos da versão instalada, com os mesmos volumes e dados. A atualização usa a tag nova como fonte das migrations, Edge Functions e frontend.

1. Em uma janela de manutenção, suspenda frontend, webhooks e jobs que escrevam no stack. Mantenha Postgres e Storage acessíveis para o backup. No daemon de origem, registre os IDs completos dos containers Postgres e Storage e confirme os volumes nos mounts. Na raiz da tag v0.1.6, com os mesmos contexto e socket Docker da instalação, execute:

   ```sh
   node scripts/local.mjs status
   node scripts/backup.mjs dump
   node scripts/backup.mjs verify-restore
   ```

   Guarde `.local/backups/` e a configuração privada em armazenamento restrito. O dump inclui o histórico nativo quando presente. Com a máquina parada, tire um snapshot dos discos que contêm os dados do daemon, os volumes e a configuração. Preserve esse snapshot fora dos volumes atualizados e restaure-o em uma VM isolada para o ensaio, com a mesma versão do Supabase e com SMTP externo, webhooks e jobs desativados. Na cópia, suba o stack pelos comandos da v0.1.6 e confira DB, Storage, histórico e acesso a objetos privados antes de proceder. Se a verificação falhar, preserve a instalação e investigue.

2. Extraia a tag nova em outro diretório. Em um shell sem contexto remoto e executado na mesma máquina do daemon, aponte `ICARUS_ANTIGO` e `ICARUS_NOVO` para os diretórios absolutos das duas versões. Confirme que `docker port "$ICARUS_DB_ID" 5432/tcp`, com o ID completo registrado do Postgres, mostra `127.0.0.1:58522` e que o TOML da tag nova declara `icarus-courses-local` e essa porta. Com o CLI `2.109.1`, use o perfil local criado pelo `status` da v0.1.6:

   ```sh
   icarus_cli_local() {
     SUPABASE_SERVICES_HOSTNAME=127.0.0.1 supabase \
       --workdir "$ICARUS_NOVO" --profile "$ICARUS_ANTIGO/.local/supabase-profile.toml" "$@"
   }
   icarus_cli_local migration list --local
   icarus_cli_local db push --local --dry-run
   ```

   Para uma v0.1.6 íntegra, o banco deve registrar `202611230001` a `202611230020` e a prévia deve listar somente as migrations a partir da `202611230021` até a última da tag nova. Se houver lacuna, versão extra ou SQL aplicado manualmente sem registro, pare e compare o schema e os recibos com a fonte em uma cópia. `migration repair` altera somente o histórico. Use esse comando apenas em uma reconciliação explícita com prova do DDL já efetivo. Evite reset do banco, reexecução de seed e limpeza de volumes.

3. Depois do ensaio e da conferência do destino, execute a aplicação e confira que as duas colunas do histórico coincidem, cada versão aparece uma vez e o novo dry-run está vazio:

   ```sh
   icarus_cli_local db push --local
   icarus_cli_local migration list --local
   icarus_cli_local db push --local --dry-run
   ```

   Se a aplicação falhar, preserve o erro e confira o schema e o histórico antes de repetir. Uma falha ao registrar a versão pode ocorrer após o `COMMIT` do arquivo SQL. Restaure em uma cópia ou reconcilie com evidência da versão exata. Retome a origem preservada ou restaure o snapshot e o conjunto de banco, Storage e configuração para voltar à versão anterior.

4. Reinicie somente Edge Functions pelo helper da v0.1.6, apontando a fonte para a tag nova. A cópia da configuração abaixo contém a URL local e a chave pública. O runtime Edge continua usando o ambiente privado da instalação existente.

   ```sh
   cd "$ICARUS_ANTIGO"
   ICARUS_FUNCTIONS_WORKDIR="$ICARUS_NOVO" node scripts/local.mjs functions-restart
   install -m 600 .env.local "$ICARUS_NOVO/.env.local"
   cd "$ICARUS_NOVO"
   npm ci
   npm run dev
   ```

   Confirme a saúde de Auth, Storage, PostgREST e Edge, além dos IDs e volumes já registrados. Valide login de conta existente, acesso a material privado, permissões de membro e admin e um convite via Mailpit antes de liberar escritas. Execute a mesma sequência na instalação de origem só depois de validar a cópia. O ensaio DB-only abaixo usa projeto próprio e serve à verificação do instalador.

### Atualizar o stack Docker a partir da v0.2.0

Ensaie primeiro numa cópia desligada da internet pública, sem webhooks, SMTP externo ou tarefas de pagamento. Separe os checkouts das duas tags em `ICARUS_ANTIGO` e `ICARUS_NOVO`. Use o socket e o ID do daemon que instalou o stack. Suspenda escritas da aplicação e dos jobs. Faça e verifique o backup pelos comandos da versão instalada, incluindo Postgres e Storage, e preserve o ambiente Edge e um snapshot da VM para recuperação.

1. No checkout antigo, rode `node scripts/local.mjs status` com `ICARUS_INSTALL_DOCKER_HOST` e `ICARUS_INSTALL_DOCKER_ID`. Confira os IDs registrados em `.local/local-installation.json`. O CLI deve usar o mesmo `DOCKER_HOST` e `SUPABASE_SERVICES_HOSTNAME=127.0.0.1`. Na tag nova, rode `supabase migration list --local` e `supabase db push --local --dry-run`. Compare a sequência remota com a da tag instalada. Depois do ensaio e da conferência, rode `supabase db push --local`. Confira novamente a lista e a prévia vazia.
2. Confira por `docker inspect --format '{{json .Mounts}}' "$ICARUS_EDGE_ID"` que o Edge registrado monta `supabase/functions` do checkout antigo, com o ID completo conferido no recibo. Enquanto o frontend está suspenso, pare só esse Edge pelo ID. Preserve a pasta de funções antiga e instale a pasta completa da nova tag no mesmo caminho da montagem, incluindo `_shared`. Copie somente o `.env` privado da pasta antiga com modo `0600`. Se o caminho da montagem for outro, use a origem exibida no `inspect`, dentro do checkout registrado. Preserve o TOML, o checkout, a rede, o ambiente do contêiner e os volumes do stack original.
3. No checkout antigo, rode `node scripts/local.mjs functions-restart`. O helper retoma o mesmo Edge e valida as respostas. Confira `capabilities`, login de uma conta existente, mídia privada assinada, acesso de membro e admin e um convite via Mailpit. A configuração precisa dos secrets da versão nova para exercer integrações elegíveis. Em produção, configure secrets pelo procedimento da instalação antes de ativar funcionalidades externas.
4. Copie com modo `0600` o `.env.local` do checkout antigo para o novo. No checkout novo, use `umask 022`, `npm ci`, `npm run build` e sirva o novo `dist` depois dos testes. Confira o frontend com a mesma URL pública do ambiente Edge. Em falha, restaure o snapshot e o conjunto de banco, arquivos e configuração e volte à versão antiga do frontend e das funções.

### Ensaio de banco isolado

`node scripts/clean-install.mjs install` (ou sem argumento) cria o projeto DB-only `icarus-courses-install-qa` em uma bridge própria com `127.0.0.1:58622`. O diretório `.local/clean-install` precisa estar ausente. Use o gate do Docker dedicado, inventário vazio e porta livre acima. Um start interrompido pode deixar o diretório ou a rede da tentativa. Preserve o diagnóstico e use um ambiente vazio para repetir.

- `node scripts/clean-install.mjs verify` exige o Postgres registrado em execução, o mesmo daemon e a mesma rede, somente o binding esperado, arquivos idênticos à fonte e histórico completo. Roda a suíte SQL com fixtures sintéticas no ID do Postgres.
- `node scripts/clean-install.mjs upgrade` exige o mesmo destino em execução, configuração original, histórico consecutivo e arquivos já copiados idênticos à fonte. Pelo ID registrado, o `psql` executa cada migration e registra sua versão em `supabase_migrations.schema_migrations` na mesma transação. Os arquivos fonte permanecem íntegros e delimitados por `BEGIN` e `COMMIT`. Só versões inteiras podem formar o prefixo aplicado. Para retomar, confira o histórico e `.local/command-failure.json`. Se uma tentativa com a versão anterior do instalador deixou schema e histórico divergentes, preserve o QA para diagnóstico e use uma cópia íntegra para o novo ensaio. `.local/clean-install-evidence.json` registra a última ação concluída. [Transações em PL/pgSQL](https://www.postgresql.org/docs/17/plpgsql-transactions.html).
- Rode `node --test scripts/clean-install.test.mjs scripts/local.test.mjs` para validar as recusas, o encaminhamento do upgrade e os fluxos do instalador com dublês. Para aceite nativo, use o archive do commit pretendido, aplique todas as migrations da árvore e confirme histórico e SQL/outbox no QA. Para ensaiar a transição 028 → 029 em outro daemon vazio, use o mesmo instalador com as migrations e os testes SQL da revisão anterior à 029. Após instalar e verificar o histórico até 028, recoloque as migrations e testes do archive-alvo no mesmo checkout, preserve `.local` e execute `upgrade` seguido de `verify`.
- Para o aceite completo de terceiros, use também um stack Supabase novo com Auth, PostgREST, Storage, Edge Functions e Mailpit. Exercite primeiro administrador, cadastro/convite, MFA, autorização, mídia privada e os fluxos abaixo. Um build sem `.env.local` comprova compilação. `npm run local:start` e `node scripts/test-integrations.mjs --local` verificam o stack configurado com as fixtures da demonstração.

### Migrations e fluxos da árvore atual

Aplique `202611230001` a `202611230040` e depois `202611250001` a `202611250003` em ordem antes de servir este frontend. A `026` prepara as notificações usadas pela `029`, e a `025` reaproveita validação da `024`. Preserve o bucket privado `icarus-private`, o bucket público de marca `icarus-brand`, as policies RLS e os `GRANT`/`REVOKE` da fonte. A aplicação autentica pelas autoridades do Supabase e os papéis continuam separados dos direitos por plano.

| Migration | O que configurar ou validar |
| --- | --- |
| `021` | Editar o texto de uma publicação com imagem privada, confirmar que a imagem anterior permanece e que a edição volta à moderação. |
| `022` | Em `/admin/podcasts`, cadastrar e publicar episódio com ID YouTube e link opcional de episódio Spotify. Em `/app/podcasts`, validar busca, capítulos e marcação de assistido. |
| `023` | Agenda e acervo em `/app/encontros-ao-vivo` e edição em `/admin/encontros`. O operador fornece data, duração, permissão por plano, link Zoom/Meet e gravação opcional. O backend autoriza acesso e confirmação de presença. |
| `024` | Com uma aula publicada, validar favoritos, notas restritas ao titular e comentários que passam pela moderação. |
| `025` | Configurar as seções editoriais no admin da aula e testar capítulos com mídia, checklist por membro e, se usado, CTA com link HTTPS oficial do WhatsApp. |
| `026` | Validar central, preferências, leitura e avisos de certificado/comentário aprovado com dois membros. Os avisos são internos ao aplicativo. |
| `027` | Buscar cursos, módulos e aulas publicados com membros de planos diferentes e validar o acesso de cada resultado. |
| `028` | Concluir aula/emitir certificado no mesmo cenário de atualização de perfil e suspensão. Conferir resultado consistente, erro recuperável em disputa e ausência de escrita parcial. |
| `029` | Configurar anúncio de curso ou módulo em rascunho, inscrever membro elegível e publicar. Conferir o aviso interno por inscrição e os gates de acesso na entrega. |
| `030` | Em duas contas, marcar episódios distintos e baixar os dados de cada titular em Configurações. Conferir apenas seus próprios IDs em `podcast_watches`, inclusive depois de um episódio voltar a rascunho. |
| `031` | Enviar um feedback com print pelo cabeçalho da área de membros. Confirmar leitura apenas pelo titular ou por admin com sessão válida, transição auditada na fila e export do titular. Atualizar as Edge Functions de upload e mídia da mesma revisão. |
| `032` | Acessar Dashboard e Analytics como admin e conferir períodos, valores agregados, funil e contagem de conclusões por aula. Conferir a negativa a outros papéis. |
| `033` | Validar Ranking com ações de dois membros, deduplicação e expurgo de fixtures por titular. Conferir a projeção mínima e a trilha no export. Fechamento mensal e prêmios seguem em definição. |
| `034` | Salvar o nome pelo editor de Marca e conferir a atualização nas molduras pública e autenticada. Repetir em duas sessões para validar a revisão, o conflito e o evento de auditoria. |
| `035` | Acessar Dashboard, Analytics e Feedbacks com admin sem autenticador. Ativar o segundo fator em Sua conta → Segurança, confirmar a recusa de uma sessão AAL1 e acessar novamente após validar o código. |
| `036` | Confirmar que somente a sessão autenticada executa a edição de publicações e que o backend preserva as regras de autoria e moderação. |
| `037` | Abrir duas aulas de mesmo slug em seções diferentes pelo currículo e pela busca. Conferir notificações, progresso e endereços anteriores. |
| `038` | Verificar o retorno do checkout visitante no mesmo navegador, o prazo do recibo e a consulta da conta titular após expirar. |
| `039` | Conferir no Dashboard e no Ranking o intervalo personalizado, incluindo eventos na data final em Brasília. |
| `040` | Abrir a vitrine com aluno novo e com aluno em andamento. Iniciar e retomar uma aula pelo cartão e conferir o acesso para cursos e módulos restritos. |
| `202611250001` | Comprar como visitante, trocando o email e a `attempt_key` a cada tentativa, e conferir que a sexta tentativa no mesmo minuto, do mesmo IP, recebe 429. Repetir o mesmo email e conferir o 429 na quarta. Errar a senha da reautenticação seis vezes no minuto e conferir a liberação no minuto seguinte. Publicar a `checkout` e a `reauthenticate` da mesma tag. |
| `202611250002` | Entrar com o código marcando Lembrar por 15 dias, ficar parado além de 2 h (membro) ou 30 min (equipe) e conferir que o acesso continua. Sem a caixa, conferir que a sessão expira como antes. Conferir que Sair encerra a sessão e que uma sessão só com senha continua recusada quando há fator verificado. |
| `202611250003` | Em Configurações → Plataforma e marca, enviar a logo colorida e a branca em PNG ou WebP de até 500 KB e o ícone em PNG quadrado; trocar e remover cada um. Conferir a logo nas telas de entrada antes do login, no menu do aluno e do admin, no checkout e no certificado, nos dois temas, e o ícone na aba. Na aba Certificado de um curso, enviar a assinatura em PNG, emitir um certificado e conferir a assinatura e o "Emitido por" com o nome da instalação na tela, em `/verificar` e no PNG e PDF. Conferir que um arquivo renomeado, maior que 500 KB ou fora das dimensões é recusado e que um membro recebe 403. Publicar a `upload` da mesma tag. |

**Logo, ícone e assinatura** ficam no bucket público `icarus-brand`, criado pela `202611250003` só para a marca: PNG (a logo também WebP) de até 500 KB, leitura pela URL pública e nenhuma policy em `storage.objects`, então anon e authenticated não listam nem gravam. Só a Edge `upload` grava, com a service role, depois de o banco conferir o papel de admin e, como nas demais ações de admin, a sessão AAL2 quando o admin tem 2FA ativo. Cada envio ganha um caminho novo, servido com cache de um ano, e o arquivo anterior é apagado só depois de o banco apontar para o novo. Uma logo trocada ou removida sai do Storage, mas a URL antiga pode continuar respondendo do cache da CDN e dos navegadores até expirar; por isso, não envie imagem que não possa ser pública. Se já existir um bucket `icarus-brand` com outra configuração, por exemplo de outro sistema no mesmo projeto, a migration para com uma mensagem clara em vez de alterá-lo. O certificado guarda o caminho da assinatura da emissão, e o arquivo de uma assinatura usada por certificado não é apagado na troca. A `202611250003` também limpa a antiga URL de assinatura dos cursos e passa a recusar uma nova: antes de aplicar, confira quais cursos têm `signature_url` preenchido, porque os próximos certificados deles sairão sem imagem até um admin enviar o PNG. Certificados já emitidos mantêm a URL no PNG e no PDF. O Icarus não publica uma Content Security Policy. Se o seu servidor definir uma, inclua a origem pública do Supabase em `img-src`, além de `connect-src`, para a logo aparecer; o certificado desenha a logo num canvas com `crossOrigin="anonymous"`, e o Storage responde com `Access-Control-Allow-Origin: *`.

**Lembrar por 15 dias** vale para todos os papéis, inclusive admin e equipe, e a caixa vem desmarcada. Oriente a equipe e os alunos a não marcá-la em computador compartilhado ou público: até o fim dos 15 dias, quem abrir aquele navegador entra sem senha nem código. Para encerrar antes, use Sair, que encerra a sessão da conta em todos os aparelhos. O limite é conferido no banco pela `202611250002`, e nenhuma configuração do Supabase Auth precisa mudar.

A validação de navegação também cobre entrada e confirmação de email, primeira senha, perguntas de onboarding, edição parcial do perfil e MFA opcional. A seed fornece perguntas iniciais editáveis. Cadastre os próprios cursos, aulas, materiais, planos, ofertas e documentos legais pelo fluxo administrativo apropriado.

## Primeiro administrador sem conteúdo demo

Em instalação real, use um administrador próprio. As migrations e a seed padrão deixam usuários, preços, cursos e ofertas comerciais a cargo do operador. O helper abaixo exige o stack local registrado. Ele consulta as credenciais do Auth na instalação validada e usa o ID registrado do Postgres para promover a conta. Para Supabase hospedado, siga o [procedimento do primeiro administrador hospedado](#primeiro-administrador-hospedado).

```sh
node scripts/first-admin.mjs invite email-do-responsavel
```

O operador informa o destino deliberadamente. O script usa Auth Admin nativo para criar conta **não confirmada**, com markers exclusivos de app_metadata e `password_setup_required=true`; nenhuma senha é fornecida, conhecida, impressa ou enviada. O Auth pode gerar internamente uma credencial aleatória. O convite nativo vai para o SMTP configurado, que no ambiente entregue é Mailpit local. SDK200 não comprova recebimento externo.

O titular abre o convite recebido, confirma email, define sua própria senha pela Edge `password-setup`, conclui onboarding. Pode ativar MFA TOTP nas configurações de segurança quando desejar. O operador então executa:

```sh
node scripts/first-admin.mjs promote
```

Essa ação é SQL privilegiado **específico para o ID salvo em `.local/first-admin.json`**, sem RPC pública de papel. Só promove se a conta não for demo/suspensa, tiver email confirmado, primeira senha concluída. Demais usuários não conseguem editar role pelo perfil. Contas com fator verificado exigem JWT/sessãoAAL2; contas sem fator podem operar em AAL1; não existe bypass por email ou marker no user_metadata. O arquivo privado do operador não deve ser commitado.

## Cabeçalhos do frontend hospedado

Envie os cabeçalhos pelo servidor que entrega o `index.html` e o fallback da aplicação. Em Caddy, coloque o bloco abaixo dentro do site HTTPS e substitua `https://projeto.supabase.co` pela origem de `VITE_SUPABASE_URL`. Use também a origem pública do Storage se ela for diferente. A mesma política se aplica ao login e à administração.

```caddyfile
header {
    Content-Security-Policy "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://projeto.supabase.co https://api.github.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://player.mediadelivery.net https://iframe.mediadelivery.net https://www.youtube-nocookie.com https://open.spotify.com; img-src 'self' data: blob: https://projeto.supabase.co https://i.ytimg.com; media-src 'self' blob: https://projeto.supabase.co; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    X-Frame-Options "DENY"
}
```

`style-src 'unsafe-inline'` permite os estilos aplicados pelos componentes React, como a posição do vídeo. O JavaScript usa apenas arquivos próprios e o Turnstile. A consulta de atualizações usa `api.github.com`. Site com domínio próprio para o player deve acrescentar a origem exata à lista de frames. Aplique HSTS no HTTPS depois de verificar o certificado e o redirecionamento HTTP. Use `caddy validate` antes de recarregar a configuração. Confira os cabeçalhos no login e em uma rota interna e teste os frames de Turnstile, Bunny, YouTube e Spotify, a marca do Storage, a ajuda e o checkout em uma instalação de ensaio. Consulte a [referência do Caddy](https://caddyserver.com/docs/caddyfile/directives/header) e as [diretrizes do Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).

## Edge Functions e secrets

`start` cria o Edge Runtime com o stack nativo. `functions` verifica sua prontidão e `functions-restart` recupera também o Edge registrado que já parou, desde que os demais serviços estejam ativos. O comando usa o ID e a configuração original. `stop` para os IDs registrados e preserva containers e volumes. O start aguarda até 30 s por Auth/Storage/PostgREST e até 90 s pela resposta Edge. Os recibos ficam em `.local/start-evidence.json` e `.local/edge-readiness.json`. `.local/command-failure.json` guarda o diagnóstico privado de falhas do CLI.

`local-bindings.mjs` valida bindings em uso pelo instalador. Os comandos antigos de reparo e rollback foram desativados. Journals e backups legados ficam disponíveis para inspeção explícita.

`.env.local` contém somente `VITE_SUPABASE_URL` e a anon key pública. `.local/service.env` contém credenciais de operação. Antes do primeiro `start`, configure `.local/edge.env` com permissão `0600`. O instalador copia esse arquivo para `supabase/functions/.env` com a mesma permissão para consumo pelo CLI. Alterações nas variáveis Edge exigem configurar um novo stack isolado. O CLI fornece os secrets reservados `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` ao runtime. Guarde service role, Asaas, Bunny e senhas no servidor.

Configuração Edge local mínima:

```dotenv
APP_ORIGIN=http://127.0.0.1:8088
ICARUS_MODE=local
ICARUS_PUBLIC_SUPABASE_URL=http://127.0.0.1:58521
```

Em runtime hospedado pode ser usado `SUPABASE_PUBLIC_URL=https://dominio-publico`. O alias `ICARUS_PUBLIC_SUPABASE_URL` evita o prefixo reservado pelo CLI local. O cliente server usa `SUPABASE_URL` interno; URLs assinadas devolvidas ao browser têm apenas a origem trocada para a pública configurada, somente quando a origem original é a API interna conhecida e o caminho é Storage privado assinado. Path/query permanecem íntegros. Origem inesperada falha fechada. Nunca imprimir o token/query de uma URL assinada.

Fora do modo local (`ICARUS_MODE=local`), `APP_ORIGIN` é obrigatório. Sem ele, em produção, com `ICARUS_MODE` ausente ou com valor diferente, as funções respondem 503 `CONFIGURATION_REQUIRED` em vez de usar `http://127.0.0.1:8088`, que só vale no modo local. Os convites pós-pagamento usam esse endereço. Como a resposta sai sem CORS, o navegador mostra só um erro de conexão; o código aparece no log da função ou numa chamada por `curl`.

**Checkout e reautenticação têm limite de tentativas** no banco.
- O checkout aceita 5 tentativas por IP, 5 por conta logada e 3 por email do comprador. O limite por email vale também para quem está logado, porque usa o email da conta. Trocar a `attempt_key` não contorna o limite.
- A reserva aceita até 60 novos pedidos por minuto por instalação, inclusive sem o cabeçalho de IP. Retomar uma tentativa existente preserva o ambiente original e não consome a cota global. Ao atingir o teto, o servidor responde 429 e a transação não cria o pedido.
- A confirmação de senha da `reauthenticate` aceita 5 tentativas por minuto e 20 por hora por usuário.
- Passou do limite, a Edge responde 429 `RATE_LIMITED` e a janela seguinte libera.
- O IP vem só de `cf-connecting-ip`, que a Cloudflare deve preencher no Supabase hospedado, e o IPv6 conta pelo bloco /64. Confira na instalação depois de publicar: do mesmo IP, trocando o email a cada tentativa, a sexta no minuto deve receber 429. Se só o limite por email agir, o cabeçalho não chega à função.
- O `x-forwarded-for` é ignorado: o primeiro valor é o que o cliente escreve, e o último pode ser o próprio proxy, o mesmo para todos.
- Sem `cf-connecting-ip`, valem os limites por email, conta, instalação e o Turnstile.
- Numa instalação própria sem a Cloudflare na frente, deixe um proxy que remova o `cf-connecting-ip` vindo do cliente e o preencha com o IP real. Sem isso, o cliente escolhe o IP do limite.
- O banco guarda um md5 com prefixo fixo do IP e do email, não o texto. Isso não é anonimização: um IPv4 se recupera testando os endereços, e um email conhecido se confirma pelo hash.
- O feed, os materiais, os podcasts e os encontros aceitam 60 consultas por minuto por usuário, com janela própria para cada recurso. O servidor aplica os limites antes de listar dados.

**Retenção operacional.** O banco remove em lotes os contadores com mais de dois dias, os nonces vencidos e as sessões Icarus vencidas há mais de um dia. Um marcador de sessão vencida fica associado ao ID do Auth até o Auth apagá-lo, para impedir que o acesso seja reaberto. A auditoria de ações é mantida. Quando `pg_cron` já está instalado na aplicação da migration, a rotina roda diariamente às 03h35 no fuso do cron do banco. Nos demais ambientes, o limitador inicia lotes curtos em uma amostra das consultas bem-sucedidas e evita rodadas simultâneas com um lock sem espera.

**Turnstile no checkout.** Com o segredo `TURNSTILE_SECRET_KEY` nos secrets das Edge Functions, a `checkout` confere o token em `https://challenges.cloudflare.com/turnstile/v0/siteverify` antes de reservar o pedido ou falar com o Asaas.
- Token ausente ou recusado volta como 403 `CAPTCHA_FAILED`.
- Se a Cloudflare não responde, volta 503 e a compra fica bloqueada.
- Gere o frontend com `VITE_TURNSTILE_SITE_KEY` do mesmo widget: com o segredo e sem a chave do site, toda compra é recusada.
- Se o script da Cloudflare não carrega no navegador, o checkout mostra o aviso para recarregar e não envia a compra, como no login.
- Em uma instalação com `ICARUS_MODE=production`, a falta de `TURNSTILE_SECRET_KEY` bloqueia o checkout com 503 `CAPTCHA_UNAVAILABLE`, inclusive para pedidos no Sandbox. Em modo local, o segredo é opcional.
- O segredo fica só no servidor e é gravado por último, depois de ver o token chegar na página publicada.

O config declara `verify_jwt=false` para os handlers que fazem autorização própria: capabilities/checkout guest/recibo/webhook precisam chegar sem JWT; media/upload/reauth/password-setup exigem Auth `getUser/getClaims` e gates de sessão/recurso; process-invites aceita exclusivamente a credencial de serviço. Desativar o gateway não torna a mídia pública. As provas HTTP positivas/negativas ficam no relatório de aceite.

## Configurar Asaas e Bunny Stream

Em **Administração → Configurações → Integrações**, o painel mostra o estado e a origem de cada campo. Para salvar credenciais, gerar o token do webhook ou alterar o interruptor de Produção, ative 2FA em **Sua conta → Segurança**, entre com o segundo fator e confirme sua senha na operação. O banco aceita até cinco alterações por minuto por administrador e registra as ações sem os valores. Campos de chave vazios mantêm o conteúdo salvo.

### Gateway Asaas

1. Comece em **Sandbox**. Selecione o ambiente, informe a chave de API correspondente e salve.
2. Clique em **Gerar token**. Copie o token da janela e a **URL do webhook** para o painel Asaas daquele ambiente. Use os eventos de checkout `CHECKOUT_PAID`, `CHECKOUT_CANCELED` e `CHECKOUT_EXPIRED`, e os eventos de estorno e contestação usados pela conciliação. A URL contém `?ambiente=sandbox` ou `?ambiente=production`. Ao rotacionar o token, atualize o painel Asaas imediatamente.
3. Use **Testar conexão**. O teste só consulta a API do ambiente escolhido. Faça o ensaio de Pix/cartão, webhook, confirmação e convite no Sandbox da instalação, com comprador fictício autorizado. Antes de liberar acesso por `CHECKOUT_PAID`, o Icarus consulta as cobranças do checkout na API e confere situação, forma e total.
4. Para configurar Produção, selecione **Produção** e repita os passos com a chave e o webhook desse ambiente. Antes de ativar **Cobranças em produção**, confirme o Turnstile do checkout e faça **Testar conexão** com a chave e o token atuais. A aprovação vale por 24 horas para ligar o interruptor. Confirme a senha para ativar ou desativar. Uma mudança nas credenciais de Produção invalida a aprovação e desliga as cobranças. A desativação impede novas cobranças e os webhooks autenticados continuam conciliando pedidos já registrados.

As variáveis `ASAAS_ENV`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` continuam valendo para o ambiente ativo. Para manter webhooks de ambientes distintos após uma troca, configure cada conta com sua URL com `ambiente` explícito e guarde as credenciais correspondentes no cofre. A URL legada sem parâmetro usa o ambiente ativo ou Sandbox quando ele estiver ausente. Se houver token definido no servidor, a rotação é feita nesse ambiente. Pause e desative cobranças antes de trocar variáveis de Produção, depois rode um novo teste e reative pelo painel. `ASAAS_ITEM_IMAGE_BASE64` pode adicionar uma imagem do item no checkout.

### Bunny Stream

Salve o **ID da biblioteca**, a **Chave de API do Stream**, o **Hostname da CDN** sem protocolo ou caminho e a **Chave de autenticação do player**. Use **Testar conexão** para validar o ID e a chave de API. No Bunny, autorize o domínio do Icarus, ative a autenticação por token do player e restrinja o acesso direto a arquivos. Abra uma aula que use um vídeo dessa biblioteca para conferir a reprodução assinada. O teste de API não verifica a chave de assinatura, o hostname da CDN nem as regras de reprodução do provedor.

As variáveis correspondentes são `BUNNY_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_CDN_HOST` e `BUNNY_TOKEN_KEY`. Em instalações que já usam `BUNNY_ALLOWED_DOMAIN`, a assinatura continua exigindo que o hostname de `APP_ORIGIN` seja igual a ele. Esse domínio é o do aplicativo. O hostname da CDN é o da biblioteca e o servidor sempre usa a URL oficial do iframe para reprodução.

O cofre usa os registros `icarus_integration_asaas` e `icarus_integration_bunny`. Mantenha o backup recuperável do Vault com o backup da instalação. O roteiro de backup de aplicação abaixo abrange os schemas de aplicação, Auth e Storage. Para recuperação das credenciais, valide a restauração do Vault do próprio Supabase ou reprovisione as credenciais e faça novo teste antes de religar cobranças.

## Instalação hospedada e recursos comerciais

- Provisione um projeto Supabase próprio e [aplique as migrations](#aplicar-migrações-no-supabase-hospedado). Configure `ICARUS_MODE=production`, o `APP_ORIGIN` exato, a URL pública HTTPS da API, a Site URL do Auth e a URL absoluta de `/auth/callback` na allowlist. Publique as Edge Functions de `supabase/functions/` com a política de JWT do `supabase/config.toml`. Homologue convite, recuperação e confirmação de email com o SMTP real. `EMAIL_CONFIGURED=true` apenas sinaliza a configuração no aplicativo.
- Gere `dist/` com a URL do seu projeto e sua chave pública em `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Sirva por HTTPS com fallback das rotas para `index.html`. Se o CAPTCHA do Supabase Auth estiver ligado (Turnstile), gere o build também com `VITE_TURNSTILE_SITE_KEY`, a chave do site de um widget que inclua o hostname da instalação; o segredo fica só no Supabase Auth. Sem essa chave, entrar, cadastrar, recuperar senha e reenviar confirmação são recusados pelo Auth. Ao redistribuir, acompanhe a aplicação com o [texto MIT](../LICENSE) e preservação das licenças de terceiros indicadas em [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Use nomes, marcas e conteúdos para os quais você tenha autorização.
- Publique os textos legais aprovados e configure planos, preços e ofertas reais no admin antes de abrir cadastro ou compra. Configure o Asaas e o Bunny pelo [roteiro de integrações](#configurar-asaas-e-bunny-stream). Emissão fiscal, mídias externas e links de terceiros dependem da instalação de destino.
- Configure o [primeiro administrador](#primeiro-administrador-hospedado) em uma instalação vazia. Configure o consumidor de convites no servidor com credencial de serviço e valide entrega real em ambiente autorizado.

### Aplicar migrações no Supabase hospedado

Use a raiz da tag pretendida e o CLI `2.109.1`. Para atualizar a v0.1.6, primeiro pause escritas da aplicação e dos jobs e prepare a recuperação do projeto. Confirme um backup de banco atualizado e restaurável no Dashboard ou siga o roteiro de backup lógico do Supabase, incluindo `auth`, `storage` e o histórico `supabase_migrations`. Copie também os bytes dos objetos privados pelos meios de exportação do Storage e preserve as configurações de Auth, Edge e secrets em armazenamento restrito. O backup de banco contém os metadados do Storage. Ensaie a restauração do banco e dos objetos em um destino isolado antes do upgrade. [Backup e restauração do banco](https://supabase.com/docs/guides/platform/backups) · [Backup lógico pelo CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) · [Download de objetos do Storage](https://supabase.com/docs/guides/storage/management/download-objects)

No terminal do operador, confirme a referência do projeto no Dashboard e use-a em `SUPABASE_PROJECT_REF`. Forneça `SUPABASE_DB_PASSWORD` pelo ambiente protegido do operador para os comandos vinculados. Autentique o CLI, revise o histórico e confira a prévia antes de autorizar a aplicação.

```sh
supabase login
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase migration list --linked
supabase db push --linked --dry-run
```

Em um projeto novo, o histórico do Icarus deve estar vazio e todas as migrations da tag devem aparecer no plano. Na v0.1.6, o histórico deve estar completo de `202611230001` até `202611230020` e o plano deve começar na `202611230021`. Na v0.2.0, o histórico vai até `202611230038` e o plano lista só `202611230039` e `202611230040`. Se o histórico divergir ou houver DDL aplicado manualmente, verifique o schema contra a tag original em uma cópia antes de prosseguir. `migration repair` só corrige metadados do histórico e exige prova da mudança já aplicada ou revertida. [Histórico de migrações](https://supabase.com/docs/reference/cli/supabase-migration-list) · [Aplicação e dry-run](https://supabase.com/docs/reference/cli/supabase-db-push)

Depois de validar o destino e o plano, aplique e confira o histórico e o dry-run final. O push padrão aplica as migrations pendentes. Para uma instalação vazia que queira as perguntas iniciais do formulário, use `supabase db push --linked --include-seed` no primeiro push. Preserve a seed original em instalações em uso. Se a aplicação falhar, preserve o diagnóstico e confira schema e histórico antes de tentar novamente, inclusive se o `COMMIT` da migration já ocorreu e seu registro falhou. Restaure e valide uma cópia do backup antes de qualquer retorno de versão.

```sh
supabase db push --linked
supabase migration list --linked
supabase db push --linked --dry-run
```

Com todas as versões registradas e sem pendências, publique as Edge Functions e o frontend da mesma tag. Valide login, convite, material privado e permissões de membro e admin antes de reabrir escritas.

### Primeiro administrador hospedado

Use uma instalação vazia de administradores, com as migrations aplicadas, o frontend HTTPS acessível, SMTP e o redirect `/auth/callback` configurados e a Edge Function `password-setup` publicada. Execute `npm ci` na tag instalada. Em um terminal de operação, crie `.local/first-admin-hosted.env` com permissão `0600`. Preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do mesmo projeto conferido no Dashboard, `APP_ORIGIN` da instalação HTTPS e `ICARUS_ADMIN_EMAIL` do responsável. Execute em um shell sem essas quatro variáveis exportadas para que os valores venham do arquivo privado. O comando registra somente o UUID e o status.

```sh
node --env-file=.local/first-admin-hosted.env --input-type=module <<'JS'
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_ORIGIN, ICARUS_ADMIN_EMAIL } = process.env;
const redirectTo = new URL('/auth/callback', APP_ORIGIN);
if (new URL(SUPABASE_URL).protocol !== 'https:' || redirectTo.protocol !== 'https:' ||
    !SUPABASE_SERVICE_ROLE_KEY || !ICARUS_ADMIN_EMAIL) {
  throw new Error('Confira a configuração privada do projeto, da origem e do titular.');
}
const auth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth.admin;
const { data, error } = await auth.createUser({
  email: ICARUS_ADMIN_EMAIL,
  email_confirm: false,
  app_metadata: { icarus_server_created: true, icarus_password_setup_required: true },
});
if (error || !data.user) throw new Error('Criação recusada. Confira o projeto e o titular no Dashboard.');
console.log(`UUID criado: ${data.user.id}`);
const invite = await auth.inviteUserByEmail(ICARUS_ADMIN_EMAIL, { redirectTo: redirectTo.href });
if (invite.error || invite.data.user?.id !== data.user.id) {
  throw new Error('Convite sem confirmação para esse UUID. Confira o Auth e o SMTP.');
}
console.log('Convite solicitado. Aguarde a confirmação do titular.');
JS
```

Confirme o UUID no Dashboard de Auth. Se a criação deu certo e o envio falhou, confira a conta ainda não confirmada e reenvie o convite pelo Auth Admin para esse mesmo e-mail. O titular abre o convite, confirma o e-mail, define a primeira senha pela aplicação e testa o próprio login. [Criação de usuário](https://supabase.com/docs/reference/javascript/auth-admin-createuser) · [Convites do Auth](https://supabase.com/docs/guides/auth/users#inviting-users)

Só depois, o operador com acesso privilegiado ao SQL Editor do mesmo projeto substitui o UUID e o e-mail pelos valores conferidos. O bloco serializa a criação do primeiro admin, altera somente o perfil elegível daquele UUID e registra a ação na auditoria. Qualquer recusa aborta o bloco.

```sql
do $$
declare
  target_id constant uuid := '00000000-0000-0000-0000-000000000000';
  target_email constant text := 'responsavel@example.invalid';
begin
  lock table public.profiles in share row exclusive mode;
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'Já existe um administrador nesta instalação.';
  end if;

  update public.profiles p
     set role = 'admin'
    from auth.users u
   where u.id = target_id and p.id = u.id and lower(u.email) = lower(target_email)
     and p.role = 'member' and not p.demo and not p.suspended
     and u.invited_at is not null and u.email_confirmed_at is not null
     and u.raw_app_meta_data @> '{"icarus_server_created": true, "icarus_password_setup_required": false}'::jsonb
     and not p.password_setup_required
     and exists (
       select 1 from public.audit_events e
       where e.actor_id = p.id and e.target_id = p.id and e.target_type = 'profiles'
         and e.action = 'password-setup-complete'
     );
  if not found then
    raise exception 'Confirme UUID, e-mail, convite e primeira senha do titular.';
  end if;
  perform app_private.audit(null, 'first-admin-bootstrap', 'profiles', target_id);
end $$;
```

Peça ao titular para entrar novamente e abrir o painel administrativo. Confirme a recusa em uma conta comum. A promoção mantém os grants e as políticas RLS da aplicação. Em Sua conta → Segurança, o administrador pode ativar o segundo fator recomendado. Com fator verificado, a aplicação exige AAL2 na sessão e no JWT.

O [modelo do GitHub Actions](ci/README.md) está em `docs/ci`. A ativação e a primeira execução com o SHA da entrega ainda dependem do proprietário. Guarde resultados de build, SQL e verificação nativa com o SHA avaliado.

## Convite automático pós-pagamento

Webhook persiste pagamento antes do HTTP200 e agenda o consumidor com `EdgeRuntime.waitUntil`. A outbox tem claim exclusivo, lease, tentativas e retry; sucesso do envio significa `sent`, sem confundir com confirmação de email, primeira senha ou acesso concedido. Falha definitiva sem envio volta a pending com backoff. Timeout/falha ambígua vira `uncertain`, sem reenvio automático cego; reconciliação reavalia `auth.users.invited_at`.

O worker `/functions/v1/process-invites` usa somente credencial de serviço e lê no máximo 20 registros devidos. No Supabase local, o cron pode usar o helper com a credencial lida do arquivo privado:

```cron
* * * * * cd /caminho/icarus && /caminho/node scripts/process-invites.mjs >> .local/invite-worker.log 2>&1
```

Criar o log600 antes de ativar cron. O cron local não foi instalado no sistema durante esta tarefa. O script lê o arquivo privado e imprime somente contador ou falha segura. Nenhum retry gera cobrança. Recuperação por pedido usa `recover-invites.ts`, com o mesmo claim, sem furar lease/estado sent/uncertain.

## Backup completo mínimo da aplicação

Os comandos abaixo consultam o Postgres e o Storage registrados no daemon dedicado. Pause as escritas por uma janela curta para capturar SQL e binários Storage.

```sh
node scripts/backup.mjs dump
node scripts/backup.mjs verify-restore
```

O primeiro comando produz `.local/backups/icarus.dump`, `icarus-storage.tar.gz` e manifesto de hashes600. O dump preserva owners e ACLs (REVOKE/GRANT); não usar `--no-privileges` no dump ou restore. O segundo restaura SQL em banco novo isolado e binários em diretório temporário isolado, compara contagens/hashes SQL, conteúdo binário, owners, RLS, policies, default ACLs e privilégios efetivos de todas as funções/tabelas dos schemas public/app_private/auth/storage para anon/authenticated/service_role. Preserva a origem e remove somente os destinos QA criados. O teste negativo `verify-restore --omit-acl-negative` deve falhar mesmo com linhas/binários iguais, comprovando que a guarda detecta a perda de grants.

O pacote contém aplicação/Auth/Storage/extensions e histórico nativo quando existente; não inclui serviços externos nem configuração/roles do cluster Supabase. O restore exige cluster Supabase compatível, roles nativas já criadas e operador `supabase_admin` privilegiado para preservar ownership/ACL. Não substituir roles nem afrouxar default privileges para fazê-lo passar. Para servidor futuro, manter também uma cópia criptografada separada dos secrets/configs e executar o mesmo ensaio de restauração com imagens/roles compatíveis.

Replay real deve ocorrer somente em destino novo isolado: instalar a mesma versão Supabase para criar roles/extensions, restaurar o dump sem sobrescrever origem, preencher o volume Storage do destino com o tar validado e apontar a API do destino. Não extrair o tar sobre o volume demo atual durante um ensaio. Comparar manifesto e `storage.objects` antes de liberar leituras; validar Auth/URLs e migrar para schema posterior só depois do restore.

Retenção, cópia fora da máquina, monitoração e SMTP externo são configuração operacional futura. Um ensaio local não prova backup diário/7dias, uptime99,5% ou homologação de fornecedores.
