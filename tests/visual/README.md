# QA visual do Stitch

Inventário de **28 HTMLs** e **cinco DESIGN.md**, com duas versões de guia. O [plano de entrega](../../docs/audit/plano-entrega-stitch.md) define a autoridade visual do HTML original renderizado. O PRD e o [contrato](../../docs/CONTRACT.md) definem o comportamento e o acesso. As contagens e os códigos de saída documentados aqui qualificam o diagnóstico automatizado. O aceite de entrega avalia acabamento e cerca de 90% de fidelidade ao layout em comparação lado a lado.

## Reprodução

Execute na raiz da worktree. O manifesto v2 e os quatro pacotes ficam fora do Git. `STITCH_SOURCE` e `STITCH_PRIOR` aceitam os respectivos caminhos locais. Com esses arquivos, o inventário verifica os SHA-256 contra o manifesto v2, identifica as cinco cópias dos guias e registra as escolhas de viewport por tela. Os pacotes e recibos históricos pertencem ao ensaio original e ficam fora da distribuição. O PNG do pacote ajuda a identificar a geometria. A comparação usa os PNGs produzidos pelo Chrome a partir dos HTMLs.

```sh
umask 077
QA="$(mktemp -d "${TMPDIR:-/tmp}/icarus-stitch-visual.XXXXXXXX")"
npm install --prefix "$QA/tools" --no-save playwright@1.66.0-alpha-2026-11-18 pngjs@7.0.0
export STITCH_PLAYWRIGHT="$QA/tools/node_modules/playwright"
export STITCH_PNGJS="$QA/tools/node_modules/pngjs"
export STITCH_SOURCE=/caminho/para/os/pacotes-stitch
export STITCH_PRIOR=/caminho/para/manifesto-v2.json
export STITCH_CHROME=/caminho/para/o/executavel-do-chrome
node tests/visual/stitch.mjs self-check
node tests/visual/stitch.mjs inventory > "$QA/inventory.json"
node tests/visual/stitch.mjs capture "$QA/desktop" all desktop RGBA
node tests/visual/stitch.mjs capture "$QA/mobile" all mobile RGBA
npm ci
node tests/visual/pilots-app.mjs "$QA/app"
node tests/visual/stitch.mjs compare "$QA/desktop/run.json" "$QA/app/catalog-light-desktop.json" RGBA
```

O ensaio usou Chrome 158.0.8127.37 com interface, Playwright 1.66.0-alpha-2026-11-18, Node 26.0.0 e pngjs 7.0.0. `STITCH_CHROME` permite escolher o executável. Use um diretório novo por coleta. `pilots` seleciona os três casos instáveis e uma lista de IDs separados por vírgula seleciona casos individuais. A recaptura usa porta efêmera em loopback. A fixture da aplicação usa a porta 8247 com `strictPort` e permite alterar a porta por `STITCH_APP_PORT`. O navegador da fixture permite apenas a origem temporária. Os RPCs e a sessão são sintéticos.

Cada `run.json` contém dois contextos novos por tela, hash do HTML servido, tema, viewport, resolução integral, recursos externos com status e SHA-256, fontes, imagens decodificadas, fase de animações e tempos. Os PNGs e recibos individuais ficam ao lado. A comparação preserva toda a área renderizada a partir de (0,0), DPR 1 e sRGB, com PNGs da mesma dimensão. Um pixel diverge quando um canal selecionado difere. RGBA inclui alfa e RGB usa os três canais de cor. A caixa `diagnosticBounds` localiza diferenças, com extremidades inclusivas. A métrica integral aplica zero tolerância e usa a página inteira com as coordenadas originais.

Para comparar com uma candidata, o recibo da captura precisa vincular o SHA da referência em `referenceSha256`, registrar navegador, escala, viewport, tema, foco, scroll e ponteiro e incluir `stateProof` com `equivalent: true` e evidências verificáveis da equivalência dos dados, fontes, imagens e estado de interação. Inclua o relógio quando a referência fixa a hora. Os dois PNGs da referência são reconferidos no modo escolhido. O comando retorna saída 1 para diferenças, dimensões incompatíveis, referência indisponível ou estado incompatível. O último comando acima é um controle de recusa, pois a fixture funcional usa dados diferentes. A prova de estado é responsabilidade de quem produz a fixture.

## Pilotos e estabilidade

| Tela | Viewport desktop | Diferenças anteriores entre recapturas | Diferenças RGBA após estabilização | Tempo das primeiras capturas |
| --- | ---: | ---: | ---: | ---: |
| Catálogo claro | 1280 × 2249 | 50.133 | 0 | 1,67 s / 1,56 s |
| Catálogo escuro | 1280 × 2210 | 40.824 | 0 | 1,43 s / 1,72 s |
| Encontros escuro | 1280 × 2237 | 19.925 | 0 | 1,43 s / 1,50 s |

Os pares novos repetiram o SHA-256 do PNG de cada tela. A coleta inicial dos três pilotos levou 10,1 s e foi enviada ao coordenador antes da coleta completa. Na coleta histórica, os hashes das respostas externas bem-sucedidas de cada par coincidiram. A maior parte das diferenças variou uma unidade por canal nas áreas do destaque e das gravações. As caixas observadas foram (848,305)–(1238,749), (847,300)–(1239,729) e (296,1296)–(1239,1462), respectivamente. A configuração de software do Chrome e a fase inicial fixa repetiram as três capturas com o HTML e CSS preservados. Os dados disponíveis mostram o efeito do conjunto de controles.

O Ranking reaproveita o controle confirmado no manifesto v2. O relógio da página é congelado antes da navegação em `2026-11-24T12:01:00.000Z`, preservando `07:14:32:45` antes e depois da captura. O compositor permanece em taxa zero e o pulso em 0 ms, inclusive quando o Chrome reporta `running` nominal após capturar. A logo restaurada no Ranking repete o SHA `f46b735bd2022d41bfe75fb7cd31a58b0dc07e154bd74ee770b4c0ec91515365` do manifesto v2. A recaptura verifica que o SVG autorizado do pacote 3 foi aplicado somente à URL aprovada e decodificou em 610 × 160 px. Os dez HTMLs que usam essa URL recebem os mesmos bytes autorizados.

## Avatar aprovado para o detalhe da discussão P4

Em 24/11/2026, Tibério aprovou em mensagem direta usar as iniciais do usuário como referência para a foto de perfil indisponível no detalhe da discussão. A coordenação registrou a autorização no despacho `ctx_0f5a3477ca54`, com o perfil Alex Vance e a URL identificada pelo SHA-256 `b00f472d7115ed7ca288b6f058983822e22957a1eb31c5f7f7b0d28af9f72cb2`. O inventário confirma uma ocorrência da URL nos 28 HTMLs, no cabeçalho de `comunidade_post_thread_de_respostas` do pacote 4. O HTML servido conserva o SHA-256 `86cb7bf5bd899759a03022e82542ec15879e7a3d9fbd904acedc2c456a096bdf` do manifesto v2.

O Chrome recebe [o PNG local de AV](fixtures/p4-thread-avatar-av.png) em uma única requisição de imagem por captura do thread. O PNG de 32 × 32 px foi rasterizado com a Inter local em 12 px, peso 600, texto `#fff` e fundo `#1f1f1f`. O HTML original define a caixa, o recorte circular, a borda e a posição. O SHA-256 `93a90d773c5b4fcbf8e5127c8c24f05ebd708393bae8a508c551ffefc3348672` é conferido no arquivo e na resposta. Cada captura confirma `header img[alt="Profile"]`, o nome ao lado da imagem, a decodificação, a caixa computada antes e depois do PNG e a estabilidade do estado e dos demais recursos.

```sh
node tests/visual/stitch.mjs self-check
node tests/visual/stitch.mjs inventory > "$QA/inventory.json"
node tests/visual/stitch.mjs capture "$QA/p4-desktop" comunidade_post_thread_de_respostas desktop RGBA
node tests/visual/stitch.mjs capture "$QA/p4-mobile" comunidade_post_thread_de_respostas mobile RGBA
```

| Perfil | Viewport | PNG integral | Pixels RGBA diferentes | SHA-256 dos dois PNGs |
| --- | --- | --- | ---: | --- |
| Desktop escuro | 1280 × 1024 | 1280 × 3380 | 0 | `a33e36c40dbda1d2101e423353d410169895c530d89ac4e288c4ec8b766d3e48` |
| Diagnóstico escuro a 360 px | 360 × 880 | 1079 × 8670 | 0 | `e03f097e6dd37e665e84aa9556b973f959fc65db9d4387cd2d4902bf1f9a7132` |

Cada passe terminou com foco no `body`, scroll (0,0), DPR 1, tema escuro e nenhum erro de página, recurso indisponível ou imagem visível quebrada. A caixa do avatar ficou em (1224, 15,5) no desktop e em (568,359375, 15,5) a 360 px. A largura original de 1079 px a 360 px permanece registrada. O comparador marca essa captura como diagnóstico e devolve `referencia-mobile-em-diagnostico` para uma candidata. A aprovação do critério de referência adaptada e a comparação integral com o app continuam pendentes.

Uma coleta desktop entre os dois pares válidos detectou uma resposta `text/html` com HTTP 200 para uma fonte, classificada como `unexpected-font-response`. O avatar foi decodificado nos dois passes; o coletor classificou o par como `referencia-indisponivel`.

## Prova a 360 px e requisitos de produto

| Tela | Viewport CSS | Documento do HTML original | Diferença RGBA entre recapturas | Documento da aplicação |
| --- | ---: | ---: | ---: | ---: |
| Catálogo claro | 360 × 880 | 453 × 8291 | 0 | 360 × 1393 |
| Catálogo escuro | 360 × 880 | 479 × 8172 | 0 | 360 × 1357 |
| Encontros escuro | 360 × 880 | 469 × 9507 | 0 | 360 × 2082 |
| Encontros claro | 360 × 880 | Sem HTML claro entregue | — | 360 × 2082 |

As capturas preservam o overflow horizontal do HTML original. A largura de 360 px exigida na aplicação torna incompatível a igualdade integral nesses pilotos mobile. A busca do HTML usa 12 px nas três telas, abaixo dos 16 px do requisito. A logo preta autorizada sobre `#0e0e0e` tem contraste 1,09:1, conforme a evidência do manifesto. Essas decisões de referência ficam abertas para homologação.

A fixture exercita catálogo e Encontros em ambos os temas, a 1280 e 360 px, como membro. Verificou título focado, alvo mínimo de 44 px no cabeçalho e na gaveta, abertura por teclado, item ativo e restauração do foco com Escape. O membro recebeu acesso restrito ao tentar abrir `/admin/encontros` e o ensaio confirmou bloqueio por plano, confirmação e cancelamento de presença sem recarga. A prova cobre o comportamento da aplicação com respostas HTTP sintéticas. As políticas de banco dependem de ensaio próprio com backend local e papéis reais.

A fixture funcional de catálogo tem um curso e omite as mídias, a grade e os lançamentos do protótipo. Em Encontros ela usa um encontro acessível, um restrito e acervo vazio. A comparação com os HTMLs foi recusada por estado diferente. A paridade da aplicação segue aberta até capturar fixtures com dados equivalentes.

## Cobertura histórica anterior à exceção do avatar

| Perfil | Inventariados | Recapturados duas vezes | Repetíveis com zero pixels RGBA diferentes | Ativo indisponível | Tempo da coleta + repetição direcionada |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop | 28 | 28 | 27 | 1 | 88,8 s + 6,5 s |
| 360 px | 28 | 28 | 27 | 1 | 85,9 s + 3,5 s |

A mediana por captura foi de 1,40 s no desktop e 1,41 s a 360 px. A coleta inteira somou aproximadamente 3,1 s por HTML e perfil, incluindo duas passagens e a métrica. A 360 px, 26 HTMLs apresentaram overflow horizontal. A maior largura do documento foi 1079 px, no thread.

- **Thread de comunidade.** Antes da autorização, a URL do avatar redirecionou ao login do Google e o Chrome registrou `ERR_BLOCKED_BY_ORB`. A imagem ficou com dimensões naturais 0 × 0 em desktop e mobile. O segundo ensaio desktop usou 1280 × 1024, conforme trilho e painel presentes no export de 606 px, e confirmou o bloqueio.
- **Fonte intermitente.** Um carregamento de Gestão de equipe no desktop e um de Feedbacks a 360 px receberam `text/html` com HTTP 200 em uma URL de fonte. O coletor sinaliza esse resultado com `unexpected-font-response`. A repetição em contextos novos obteve fontes válidas com SHA coincidente e zero diferenças nas duas telas. As falhas originais foram preservadas nos recibos.
- **Estados e requisitos.** Seis comparações pilóticas da fixture com HTML foram barradas por estado diferente. Os dois casos de Encontros em claro ficaram sem referência fornecida. O comparador retornou zero no controle instrumental RGB e RGBA, usando duas capturas independentes do catálogo claro no mesmo estado. O aceite fica aberto para mídia e dados equivalentes, responsividade a 360 px, fonte de entrada de 16 px e contraste da marca escura.

## Verificação local

`npm test -- src/member-shell.test.tsx src/live-events.test.tsx src/catalog.test.tsx src/catalog-launches.test.tsx` passou com 29 testes em quatro arquivos. O autocheck valida alteração de alfa em RGBA, alteração de cor em RGB e recusa de dimensões incompatíveis. A conferência SHA-256 passou nos 285 arquivos do recibo externo. As portas compartilhadas 8097, 8197, 8100 e 8200 mantiveram os mesmos processos e a porta 8247 foi encerrada. Esta entrega modifica somente `tests/visual/` e usa fixtures locais.

## Exports mobile dedicados do Stitch

O pacote `stitch_icarus` trouxe os HTMLs mobile do Fórum, do Catálogo e do Player nos dois temas. Os dois guias repetem o SHA-256 dos guias desktop. Os PNGs do pacote medem entre 206 e 256 px de largura. A referência usa a recaptura do HTML original em viewport de 360 × 880, DPR 1, sem redimensionar o PNG entregue. Esses seis HTMLs são independentes do diagnóstico dos HTMLs desktop a 360 px.

```sh
export STITCH_MOBILE_SOURCE=/caminho/para/stitch_icarus
node tests/visual/stitch.mjs inventory-mobile
node tests/visual/stitch.mjs capture "$QA/mobile-exports" all mobile-export RGBA
```

| Rota | Claro, PNG integral | Escuro, PNG integral |
| --- | --- | --- |
| Fórum | 360 × 2513 | 360 × 2686 |
| Catálogo | 360 × 3065 | 360 × 2475 |
| Player | 360 × 2682 | 360 × 2754 |

Os seis pares verificados são idênticos em RGBA e SHA-256. A rechecagem repetiu os três casos da primeira rodada que tiveram resposta de fonte inválida ou falha de captura no Chrome. O coletor associa cada PNG ao recibo da captura.

A moldura mobile do Fórum e do Catálogo tem cabeçalho compacto, gaveta e barra inferior. O Player traz cabeçalho próprio com ação de voltar. A validação funcional segue o contrato do Icarus para destinos, acesso e ações. O aceite visual da aplicação contra essas referências está aberto. O detalhe da Discussão e os painéis administrativos seguem com as respectivas referências anteriores enquanto não houver um export mobile dedicado.
