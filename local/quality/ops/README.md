# Operação e recuperação local

Escopo exclusivo do site `tiberio.localhost` no projeto Docker `tiberio-frappe-local`.
Requer Python 3.12+, Docker disponível e as imagens locais já existentes. Não faz build,
pull, restart, reset, migration, envio ou limpeza global. O código Python usa biblioteca
padrão no host; dentro da imagem reutiliza PyMySQL/Frappe já instalados.

## Antes de build, atualização ou diagnóstico

```sh
umask 077
python3 local/prepare.py
python3 local/quality/ops/operations.py preflight --planned-bytes 21474836480
```

`prepare.py` baixa exclusivamente o arquivo público do Payments na revisão fixada,
confere SHA256, recusa redirects e extrai apenas arquivos/diretórios em staging no mesmo
filesystem. Recusa caminhos perigosos, links, duplicatas e árvore incompleta. Compara
todos os arquivos, diretórios e bits de execução da cópia existente com a árvore
verificada. Uma divergência interrompe o processo e preserva a cópia existente; revisar e
quarentenar explicitamente antes de repetir. Não existe reparo destrutivo automático.

A promoção inicial é um rename atômico. `flock` serializa preparos concorrentes e é
liberado pelo sistema mesmo após SIGKILL. Staging abandonado nunca é sentinela de sucesso;
não há varredura automática de diretórios antigos. Mudança dos bytes do arquivo público,
mesmo na mesma revisão, exige revisão e atualização explícita do pin.

O preflight confere labels/estado dos sete serviços autorizados, healthcheck MariaDB,
HTTP `/api/method/ping`, Redis PING e `bench doctor --site tiberio.localhost`. Guarda os
logs nativos recentes somente em `.local/quality/ops`, com resumo sem payloads. Ausência
de worker, scheduler pausado/desabilitado, serviço parado, ping falho ou disco insuficiente
produz status `blocked` e código de saída 1. Linhas recentes com erro são contadas, sem
transformar automaticamente um erro histórico em falha atual.

O orçamento usa o menor espaço livre entre host e filesystem do banco no Docker, reserva
7 GiB, soma `--planned-bytes` e estima três capturas mais duas expansões de restore a
partir do tamanho físico do banco e dos arquivos/configuração. Os 20 GiB do exemplo são
reserva planejada para build, não medição de consumo nem autorização para executar build.
Não é previsão de capacidade do servidor. Scheduler habilitado e processo rodando não
comprovam execução de jobs ou heartbeat sustentado; esse ensaio pertence à integração.

## Capturar e restaurar

```sh
umask 077
python3 local/quality/ops/operations.py backup
python3 local/quality/ops/operations.py restore --backup .local/quality/ops/backups/UTC_DA_CAPTURA
```

`backup` grava dump MariaDB completo com `--single-transaction --skip-lock-tables`, arquivos
públicos/privados, `site_config.json`, `common_site_config.json`, `apps.txt`, `secrets.json`
e `db.env`. O banco do produto recebe somente leituras. Não chama o backup agendado nativo,
pois ele pode remover backups anteriores antes de capturar.

As capturas anterior e posterior comparam todas as tabelas, schemas, contagens, hashes de
conteúdo e arquivos/configuração. Mudança durante a captura aborta sem marcador completo.
InnoDB fornece a transação consistente; tabelas não transacionais só são aceitas vazias,
com igualdade anterior/posterior e confirmação adicional no restore. Dados em MyISAM
exigem outro procedimento e janela autorizada; não há conversão ou lock global automático.
Não executar DDL durante a captura. O arquivo capturado também é extraído em diretório
privado temporário e comparado com o inventário antes de publicar `complete.json`.

Diretórios privados usam 0700; arquivos e dumps usam 0600. O marcador é publicado por
rename depois de gravar e sincronizar o JSON. A captura interrompida fica preservada sem
ser aceita por restore/retenção. Valores de senha, hashes de conta, nomes de arquivos e
conteúdo de tabelas não vão para o relatório público. O resumo de stdout é sanitizado;
redirecionamentos devem manter `umask 077`.

`restore` verifica os hashes dos artefatos e cria rede Docker interna exclusiva, sem portas
publicadas. Reutiliza os IDs imutáveis das imagens já presentes no backup, com `--pull=never`.
Não monta volumes do produto. Banco, Redis e logs usam tmpfs; os arquivos restaurados ficam
num diretório privado próprio. Os limites deste ensaio são 1 GiB para dados MariaDB,
64 MiB para Redis e 32 MiB para logs; uma base maior exige rever o orçamento antes de ensaiar.

A configuração original é capturada integralmente; no destino isolado substituem-se host e
credenciais do banco/Redis e pausam-se scheduler, e-mails e telemetria. A senha sintética de
restore contém `$` e é comparada byte a byte dentro do consumidor sem imprimir seu valor.
Isso verifica o transporte do restore; não substitui a conferência de cada consumidor do
produto quando o integrador recriar Compose.

O restore confere todas as tabelas por schema/conteúdo/contagem, arquivos por SHA256 e os
fluxos nativos da fixture existente: conteúdo da aula, matrícula, progresso positivo,
matriculado permitido, outro aluno/Guest negados e referências públicas/privadas legíveis.
Não recria, redefine senha nem apaga a fixture caso ela divergir. As duas configurações
alteradas para isolar o destino são explicitadas no recibo; os demais arquivos coincidem.

### Engines mistas e janela exclusiva do integrador 08

O backup comprovado de `20261121T141259664718Z` permanece preservado. Leituras posteriores
encontraram dados em MyISAM no produto: a nova captura transacional foi recusada. Isso não
autoriza apagar logs, limpar busca, converter engines ou relaxar a guarda. A captura
atual do produto fica pendente da janela da 08; nenhum lock/pausa do produto foi executado
nesta frente.

O modo alternativo usa uma conexão dedicada com `autocommit=0`, verifica
`innodb_table_locks=1`, recusa Galera e aplica `LOCK TABLES ... READ WAIT n` nos objetos
do banco deste site. Mantém esses locks durante inventário, dump nativo e arquivo de
dados/configuração. Não usa `READ LOCAL`, lock global ou `--single-transaction` nesse
modo. O dump recebe `--skip-lock-tables`: os locks ficam na outra conexão e não são
liberados por uma transação aberta pelo probe. A documentação MariaDB explica as
[limitações e diferenças dos locks](https://mariadb.com/docs/server/reference/sql-statements/transactions/lock-tables)
e as [opções mutuamente exclusivas do dump](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump).

Reproduzir o laboratório, sem tocar no banco do produto:

```sh
python3 local/quality/ops/operations.py mixed-lab --backup .local/quality/ops/backups/20261121T141259664718Z
```

Esse comando restaura o backup numa rede interna exclusiva e cria tabelas InnoDB, MyISAM
e Aria preenchidas somente nessa cópia. Exercita inserts bloqueados nas três engines,
outro banco permanecendo gravável, timeout de aquisição, duração excedida, erro do dump,
SIGTERM e SIGKILL do cliente. Reaquisição e inserts confirmam liberação. Também executa
dump/restauração nativos e compara todas as tabelas e os arquivos capturados. A aplicação
do produto não é pausada. A fixture de laboratório existe só nos recursos descartáveis.

Procedimento da 08, a executar pelo único integrador e validar sobre o estado atual:

1. Antes da pausa, rodar preflight e registrar IDs, imagens e estado anterior dos containers
   `tiberio-frappe-local-{frontend,websocket,backend,worker,scheduler}-1`. Confirmar que são
   exclusivos desta aplicação. Não usar comandos em outros projetos ou parar DB/Redis.
2. Abrir `try/finally` antes de mudar o primeiro serviço. Fechar ingresso de novas escritas;
   interromper o scheduler; solicitar encerramento gracioso dos workers e do backend.
   Usar `docker stop --time 30 ID_EXATO` somente nos containers dessa lista que estavam
   rodando, em ordem frontend/websocket/scheduler/worker/backend. O integrador deve validar
   o prazo no ambiente real: exit 137 ou processo ainda ativo significa drenagem falha e
   aborto. Não tratar kill por prazo como conclusão graciosa de jobs/requisições.
3. Confirmar ausência de escritores e DDL, incluindo conexões externas deste banco.
   Na conexão nativa restrita ao banco do site, a consulta abaixo deve retornar zero;
   resultados diferentes exigem investigação, sem matar conexões de terceiros:

   ```sql
   SELECT COUNT(*) FROM information_schema.processlist
   WHERE db=DATABASE() AND id<>CONNECTION_ID();
   ```

4. Somente após essa drenagem, executar o comando abaixo. Ele usa helper efêmero da mesma
   imagem, volume de sites somente leitura, rede validada do projeto e saída privada.
   `--writers-paused` é a afirmação do integrador, não uma pausa automática. Espera padrão
   de 5s e hold de 60s são limites; a faixa aceita é 1..30s e 1..120s, respectivamente.
   SIGALRM limita o hold mesmo em erro, uma segunda conexão encerra o dono do lock e
   confirma sua ausência. Falha não publica `complete.json`.

   ```sh
   python3 local/quality/ops/operations.py backup-mixed --writers-paused --wait-seconds 5 --hold-seconds 60
   ```

5. No `finally`, retomar com `docker start ID_EXATO` somente os containers que estavam
   rodando antes, em ordem backend/worker/scheduler/websocket/frontend. Não recriar imagens
   nem iniciar serviço anteriormente parado. Verificar IDs/imagens, saúde e retomada;
   se a retomada falhar, sair com erro e informar o bloqueio. Isso deve acontecer mesmo
   quando drenagem, aquisição, dump ou validação falhar. A rotina de pausa/retomada do
   produto não foi executada nesta 03; a 08 valida seus detalhes e duração.
6. Fazer restore isolado da nova referência antes de qualquer migration. Após integrar
   schema novo, repetir backup/restore. Manter a captura anterior até a prova nova passar.

O modo transacional original continua recusando dados em engines não transacionais.
O bypass usado para ler engines mistas existe apenas no caminho protegido por READ e na
cópia isolada restaurada. Nenhum dos modos autoriza DDL, reset ou limpeza no produto.

Ao terminar, remove somente os containers criados naquela invocação, conferindo label
exata e ausência de portas, e depois a rede exclusiva. Falha ou KeyboardInterrupt também
passa pelo `finally`. SIGKILL ou queda da máquina pode deixar recursos: recuperar pelo
prefixo/label e comprovar propriedade, ausência de compartilhamento e descartabilidade
antes de encerrar; nunca usar `docker prune`. Diretórios privados de prova permanecem.

## Retenção e responsabilidade

```sh
python3 local/quality/ops/operations.py retention --keep 3
```

É somente dry-run: inventaria capturas completas deste script e propõe três cópias,
mostrando bytes e candidatos para revisão. Não possui opção de exclusão nem agenda.
Diretórios incompletos, symlinks, artefatos sem proprietário e dados de outro site não são
candidatos. Aulas, usuários, progresso, anexos, volumes e evidência histórica nunca recebem
essa regra. Artefatos antigos de build/log também não são apagados por este script.

Frequência local: executar manualmente antes de alteração de schema/serviços e sempre que
for necessária uma nova prova. RPO é o horário da última captura validada; RTO não foi
medido como compromisso. Cópia somente neste disco não cobre perda da máquina. Destino
externo, frequência automática, alertas fora do terminal e metas do servidor ficam para
a etapa autorizada do servidor. O integrador é responsável por parar diante de saída 1.

## Contrato para o integrador

1. Rodar testes e preflight; consumir os códigos de saída, sem bypass. Executar `prepare`
   imediatamente antes de criar o contexto do build. Não confiar apenas em `pyproject.toml`.
2. Fazer backup e restore isolado antes de atualizar schema/serviços. Registrar a referência
   privada e o ID da imagem, sem copiar dump/configuração para `docs` ou `local/evidence`.
3. Aplicar overlays pelo caminho existente, com hash/versão; confirmar versão de fonte,
   imagem e assets. Usar somente o caminho nativo `bench --site ... migrate`, com prévia de
   patches/schema e condições de parada. MariaDB pode confirmar DDL implicitamente.
4. Após integrar as fontes das outras frentes, conferir saúde, secret-dollar-check nos
   consumidores recriados, schema, permissões e navegação. Executar nova captura/restore
   se o schema mudar; a prova anterior não valida a integração nova. Ensaiar jobs/heartbeat
   com fixture segregada, sem liberar filas ou comunicações externas.
5. Retorno de DDL pode exigir restaurar banco, arquivos e configuração correspondentes
   à imagem anterior; trocar apenas a tag não garante compatibilidade. Este script nunca
   restaura sobre o produto: eventual retorno exige procedimento e autorização próprios.

## Homologação de navegador

```sh
python3 local/i18n/browser_login.py admin
```

O comando e `login(persona)` continuam disponíveis, mas agora apenas confirmam a identidade
da sessão da aba Orca já configurada pelo módulo `browser_matrix`. Em origem/perfil incorreto
ou sessão ausente, param com instrução para login humano ou personificação nativa autorizada
da conta de demonstração. Preservam a sessão disponível e não fazem logout, leitura de
arquivo de senhas, preenchimento de senha ou exportação de cookies/tokens.

Uma rotina que dependia de alternância automática precisa passar por essa preparação
humana/nativa antes de chamar o helper; falha não deve ser ignorada. Testes sintéticos HTTP
continuam no fluxo separado em `local/i18n/http_checks.py`. Evidências históricas permanecem
intactas; a mudança não afirma que houve vazamento de credencial real.

## Verificações proporcionais

```sh
python3 -m unittest discover -s local/quality/ops -p 'test_*.py' -v
uv tool run --offline ruff check local/prepare.py local/i18n/browser_login.py local/quality/ops
uv tool run --offline ruff format --check local/prepare.py local/i18n/browser_login.py local/quality/ops
git diff --check -- local/prepare.py local/i18n/browser_login.py local/quality/ops
```

Os testes não operam o produto: usam diretórios/archives de sandbox, incluindo SIGKILL real
de um processo de teste, entrada malformada, traversal/links, alteração da origem, árvore
preexistente adulterada, backup corrompido, orçamento e retenção sem exclusão. Ruff é uma
ferramenta de validação já em cache; o runtime operacional não depende dele. Não rodar
formatação global para ocultar os avisos herdados de `.local/quality/baseline-whitespace.log`.
