# Paridade com o Stitch

As quatro pastas entregues pelo responsável contêm 28 pares `code.html` e `screen.png`. A coluna Pacote usa 1 para `stitch_prd_interface_design` e 2–4 para os diretórios com esses sufixos. A matriz registra o ponto de partida público 0.1.6 e o avanço da candidata local. As medições históricas usam comparação exata. A revisão de entrega segue o critério visual atualizado abaixo.

## Referência de aceite visual

Em 24/11/2026, o responsável definiu que **o HTML original do Stitch, renderizado e recapturado, determina a aparência** quando diverge do `screen.png` entregue no pacote. As contagens contra os PNGs dos pacotes servem como histórico das diferenças entre as fontes. O PRD determina os fluxos funcionais.

Em 24/11/2026, Tibério aprovou **cerca de 90% de fidelidade visual ao layout** com acabamento adequado para seguir. Avaliar lado a lado a estrutura, a hierarquia e os componentes principais. Contagens de pixels são diagnósticas. Reutilizar capturas representativas e repetir a coleta quando houver mudança relevante ou evidência insuficiente. Para estados dinâmicos, usar dados comparáveis e testar as ações com o backend e o papel correspondentes.

Uma coleta independente recapturou duas vezes os 22 HTMLs fora das frentes de player, catálogo e comunidade. Os pares de 21 telas são idênticos em pixels RGBA e bytes. Quinze telas têm referência repetível com os recursos carregados. Em sete, a logo remota do cabeçalho redirecionou ao login do Google. O Ranking também variou em 55 pixels. Dez HTMLs do inventário completo usam a mesma URL de logo, incluindo o player escuro, o catálogo escuro e o fórum.

O responsável aprovou usar o SVG oficial `icarus_horizontal_preto.svg` do pacote 3 apenas para substituir a resposta da URL de logo indisponível durante a recaptura. Os bytes do HTML, o CSS e os demais recursos da página ficam intactos. O SVG tem SHA-256 `1fd3c5a3c820d9b3074e4b3343af8e1f823fc87f56b710bf207e6683f3514b7d` e é idêntico ao arquivo local da aplicação. A versão anterior das capturas fica registrada para comparação, e a nova referência exige duas capturas idênticas com a imagem decodificada.

O manifesto v2 tem 22 referências verificadas. As sete recapturas com o SVG autorizado repetiram exatamente os pixels e os bytes. O teste fixou o relógio inicial no Ranking e eliminou a variação do contador. O estilo original exibe o SVG preto sobre o fundo `#0e0e0e`, com contraste de 1,09:1. As referências registram esse resultado do HTML e a prévia mantém a marca legível em ambos os temas.

## Mapa da candidata local

Em 24/11/2026, a [prévia local](http://127.0.0.1:8110/app/cursos) serve a compilação de `cb2c716` e o banco Supabase local com as migrations 001–035. As 28 referências desktop têm uma rota ou superfície correspondente na prévia, com a cobertura e as pendências registradas abaixo. Catálogo e Player têm uma linha por tema. A revisão de entrega avalia a fidelidade visual aproximada de cada tela e registra os fluxos já verificados.

| Pacote | Referência | Rota ou superfície na 0.1.6 | Ponto de partida | Prévia local e próxima verificação |
| --- | --- | --- | --- | --- |
| 1 | Cursos e aprendizagem, claro | `/app/cursos`, `/app/cursos/:curso` | Vitrine com fileiras difere da composição com destaque e grade de módulos. Lista de espera fora da 0.1.6. | Integrada. Destaque, módulos e inscrições em anúncios editoriais. Export próprio a 360 px. |
| 1 | Player, claro | `/app/cursos/:curso/:modulo/:aula` | Toolbar, player e painel curricular em ajuste. Comentários e anotações ausentes. | Integrada. Player, materiais, engajamento e apresentação. Retomada, retorno e foco mobile exercitados no Chrome. |
| 2 | Analytics e funil de retenção | `/admin/analytics` | Funil detalhado por aula ausente. | Integrada. Funil por curso e conclusão por aula com dados persistidos. Medição por trecho pendente. |
| 2 | Feedbacks dos alunos | `/app/cursos`, `/admin/feedbacks` | Fila dedicada de feedback in-app ausente. | Integrada. Formulário e print privado pelo topo da área de membros, com fila administrativa. Reenvio e atualização após salvar cobertos por testes de regressão. |
| 2 | Gestão de equipe e auditoria | `/admin/configuracoes` | Conferir cobertura da equipe e superfície dos logs. | Integrada. Painel de equipe, acesso à ficha e busca de eventos em Auditoria. Convites e filtros avançados pendentes. |
| 2 | Integração Bunny Stream | `/admin/configuracoes` | Conferir composição e estados do provedor em instalação configurada. | Integrada. Painel Bunny Stream e leitura da configuração do servidor. Operação do provedor pendente. |
| 2 | Pedidos e faturamento | `/admin/pedidos` | Pedidos presentes. Conferir detalhes e operações fiscais. | Integrada. Livro de vendas, detalhe e CSV. Operação fiscal pendente. |
| 2 | Planos, ofertas e cupons | `/admin/planos` | Planos presentes. Conferir cupons e operações da oferta. | Integrada. Edição de planos em AJAX. Regras de ofertas e cupons pendentes. |
| 2 | Plataforma, marca e white label | `/admin/configuracoes` | Conferir opções de marca, domínio e navegação. | Integrada. Nome configurável no editor e nas molduras, com revisão independente aprovada. Domínio depende da implantação. |
| 2 | Tickets de suporte | `/admin/suporte` | Fila e thread existentes. Conferir filtros, SLA e estados. | Integrada. Fila, conversa e anexo privado exercitados com Suporte e Admin em AAL2. Critérios de SLA pendentes. |
| 3 | Certificados e habilitações | `/app/certificados` | Conferir cards, elegibilidade, emissão e ações do certificado. | Integrada. Elegibilidade e emissão. Comparação visual com os estados da referência em aberto. |
| 3 | Checkout Icarus Pro | `/short-checkout`, `/pedido/:pedido` | Conferir etapas da aplicação e do Asaas hospedado. | Integrada. Fluxo hospedado e acompanhamento do pedido. Homologação Asaas Sandbox pendente. |
| 3 | Comunidade e fórum | `/app/comunidade` | Fórum e moderação presentes. Diretório e mensagens ausentes. | Integrada. Feed e moderação. Export próprio a 360 px. Diretório e mensagens diretas pendentes. |
| 3 | Cursos e aprendizagem | `/app/cursos`, `/app/cursos/:curso` | Conferir a composição escura e as ações ilustradas. | Integrada. Destaque, módulos e inscrições em anúncios editoriais. Export próprio a 360 px. |
| 3 | Encontros ao vivo | Área de membros | Agenda, RSVP e gravações ausentes. | Integrada. Rota `/app/encontros-ao-vivo`. Publicação, agenda, RSVP e acervo exercitados com Auth local. |
| 3 | Materiais e downloads | `/app/materiais` | Conferir layout da biblioteca, filtros e download autorizado. | Integrada. Biblioteca, busca compartilhada e acesso autorizado. Download em Storage real pendente de ensaio. |
| 3 | Player, escuro | `/app/cursos/:curso/:modulo/:aula` | Toolbar, player e painel curricular em ajuste. Comentários e anotações ausentes. | Integrada. Player, materiais, engajamento e apresentação. Retomada, retorno e foco mobile exercitados no Chrome. |
| 3 | Ranking e premiação mensal | `/app/ranking` | Ranking e prêmios ausentes. | Integrada. Classificação preliminar em `/app/ranking`, com correção da contenção aprovada. Fechamento, elegibilidade e prêmios pendentes. |
| 4 | Central de suporte | `/app/suporte` | Conferir formulário, contatos, lista e thread. | Integrada. Abertura, resposta, reabertura e anexo privado exercitados com Auth local. Contatos configuráveis pendentes. |
| 4 | Post e respostas | `/app/comunidade/:post` | Conferir thread, votos e ações por papel e estado. | Integrada. Discussão e moderação; iniciais aprovadas para o avatar da referência. Referência mobile em aberto. |
| 4 | Configurações e notificações | `/app/configuracoes` | Configurações presentes. Preferências completas de notificação ausentes. | Integrada. Perfil, tema, preferências, sino e histórico. Atualização de perfil exercitada com duas sessões. |
| 4 | Cursos e aulas | `/admin/cursos`, `/admin/cursos/:id` | Conferir editor, publicação e ordenação. | Integrada. Editor, ordenação e publicação. Homologar o fluxo editorial completo na composição. |
| 4 | Dashboard executivo | `/admin/dashboard` | Painel executivo de indicadores ausente. | Integrada. Períodos e agregados. Primeira ativação exige vigência efetiva. |
| 4 | Gateway de pagamento Asaas | `/admin/configuracoes` | Conferir composição e estados da integração em Sandbox. | Integrada. Painel Gateway Asaas e leitura da configuração do servidor. Ensaio Sandbox pendente. |
| 4 | Membros e CRM | `/admin/membros`, `/admin/membros/:id` | Conferir filtros, ficha, importação e ações por papel. | Integrada. Diretório, ficha e CSV. Cortesia e auditoria conferidas com Auth local. Importação pendente. |
| 4 | Onboarding interativo B2B | `/onboarding` | Conferir sequência, validação, persistência e retomada. | Integrada. Fluxo exercitado com Auth local. Comparação integral com o HTML em aberto. |
| 4 | Podcasts e masterclasses | Área de membros | Catálogo e player ausentes. | Integrada. Catálogo em `/app/podcasts` e editor autorizado em `/admin/podcasts`. Exportação na migration 030, conferida via Auth e PostgREST na prévia. Reprodução com mídia autorizada pendente. |
| 4 | Validação pública de certificado | `/verificar/:codigo` | Conferir formulário e resultados válido, inválido e revogado. | Integrada. Consulta do código com estados de certificado. Igualar as dimensões da referência para a comparação integral. |

Para revisar uma tela, vincular a referência à rota e às ações pertinentes do PRD. Conferir a composição em viewport, tema e estado comparáveis. Reproduzir as ações com o papel e o plano apropriados e registrar os desvios que afetam a aparência ou o uso. Usar dados sintéticos identificados para validar valores ilustrativos.

## Primeira conferência local do player

A navegação de aulas passou para cima do player. O título e as ações ficaram no painel seguinte, com abas em um painel separado e progresso no painel de conteúdos. No Orca, a fixture de vídeo privado de oito segundos carregou e a conclusão exibiu confirmação do servidor. O painel lateral abriu e fechou, e a aba de materiais exibiu o item da aula. Capturas de 1280 e 360 px foram inspecionadas em ambos os temas, sem rolagem horizontal nesses estados. O escuro foi aplicado na página para conferir o render. Permanecem abertos a comparação com dados equivalentes pixel a pixel, os controles do provedor externo e as funcionalidades ausentes da referência.

## Integração local de player, navegação e catálogo

O player reconstruído, a navegação e o catálogo foram reunidos na aplicação autenticada. A rota de detalhe apresenta o destaque e a grade de módulos, com acesso ao currículo. Em 1280 px, o topo mediu 64 px, o menu 256 px e o player iniciou em x=280/y=162, com 643 × 362 px. A referência do Stitch posiciona o player aproximadamente em x=280/y=159, com 642 × 361 px. Em 360 px, o vídeo de demonstração carregou com conteúdo limitado à largura da janela. Em Configurações, a troca para escuro pelo menu atualizou também o seletor da tela aberta. A equivalência de geometria no recorte medido mantém abertas as diferenças de paleta, conteúdo, componentes e funcionalidades registradas pelos agentes.

## Integração local do fórum e da discussão

O fórum e a discussão usam os espaços e as permissões devolvidos pela API, com campos de busca, votos, publicação, resposta e revisão humana. A comparação do worker em 1280 e 360 px com dados sintéticos ainda encontrou diferenças de composição e de navegação nos dois originais escuros. Diretório, mensagens e interações que exigem novos contratos continuam abertas.

A migration 021 preserva a imagem quando a edição altera apenas o texto. O teste reproduziu a perda da imagem no schema 020, passou as 42 asserções com a correção em uma transação revertida e conferiu a ausência de acesso anônimo à função. A migration foi aplicada em seguida ao banco de desenvolvimento local.

Na frente isolada, o HTML da discussão foi recapturado a 1280 px em dois documentos idênticos. A revisão `e0ca74e` reduziu as diferenças integrais de 3.671.945 para 3.511.343 pixels. O diagnóstico a 606 px registra o transbordamento do HTML original. A aplicação permaneceu sem transbordamento a 606 e 360 px. Com Auth local, uma publicação e uma resposta de teste passaram da fila pendente para aprovadas após ação explícita de moderação. Os registros sintéticos foram removidos.

A revisão `aa337a1` corrige a escolha inicial de espaço quando o compositor abre pelo fórum filtrado e as opções ainda estão carregando. O teste com Auth local confirmou a seleção autorizada e a recusa de um espaço inexistente. A suíte de 20 testes também cobre rascunho, edição, acesso revogado e reenvio após recusa.

## Integração local do acervo, suporte e operação comercial

- Acervo e certificados: as rotas integradas abriram no Orca. O assinante sintético baixou bytes do material privado por URL assinada, e o membro sem plano recebeu recusa sem URL. O certificado sintético foi emitido após concluir as aulas, apareceu no painel e foi consultado por RPC público sem sessão. A resolução da rota `/verificar` sem código também foi conferida no navegador.
- Suporte: um chamado sintético foi aberto no formulário integrado, que avançou para a conversa após resposta do servidor. A fila e a conversa administrativas foram exercitadas com fixtures na frente de suporte.
- Checkout, membros, planos e pedidos: as telas estão integradas aos contratos existentes. Os testes de checkout/webhook usam transporte simulado. A comparação do worker registrou diferenças visuais substanciais, especialmente no suporte, checkout, shell administrativo e estados que exigem dados ou ações ainda ausentes. Homologação do provedor, verificação visual integrada de administração e aceite pixel a pixel continuam pendentes.

## Rechecagem da rota do player solicitada pelo responsável

Em 1280 × 900, tema claro, a rota de demonstração mediu o player em x=280/y=159,8 e 643,2 × 361,8 px. Foram aplicados os valores do HTML do Stitch para o fundo, a faixa da navegação, os cartões e as abas. O botão central iniciou a reprodução do vídeo privado local. A 360 px, a largura do documento foi de 360 px.

A comparação RGB do primeiro viewport, com o PNG de referência recortado em 1280 × 900 sem redimensionar, encontrou 707.418 de 1.152.000 pixels diferentes (61,4%). O conteúdo da fixture tem vídeo e currículo diferentes dos desenhados. O player nativo, o menu e as ações e abas ainda ausentes também contribuem para o desvio. Resultado visual reprovado. O aceite exige comparar com conteúdo e estados correspondentes e verificar os controles implementados, inclusive em reprodução.

## Comparação integral do player em claro e escuro

A candidata isolada `3d45ad0` inclui os controles do vídeo, os comentários, as notas, os favoritos e os blocos editoriais. Foram comparados os canais RGB das três capturas na resolução original, sem compensação de posição ou tolerância. Um pixel conta como diferente quando ao menos um canal difere.

| Tema | Dimensões do PNG | PNG × HTML exportado e renderizado | PNG × candidata |
| --- | --- | --- | --- |
| Claro, pacote 1 | 1280 × 2327 px | 494.155 | 350.054 |
| Escuro, pacote 3 | 1280 × 1971 px | 499.698 | 342.184 |

O HTML renderiza uma capa e um avatar remotos onde o PNG traz um quadro de vídeo cinza e um marcador de avatar. O fundo da página no HTML também difere da faixa preta no fim dos PNGs. No quadro da fórmula escura, um dos preenchimentos é RGB (26, 26, 26) no PNG e (27, 27, 26) no HTML. A medição antecede a escolha do HTML renderizado como referência de aceite. A candidata permanece em uma branch isolada.

A revisão `a01e97c` ajustou a barra de navegação da aula, o currículo, a ficha e a aba selecionada. Na comparação integral com os PNGs, as diferenças caíram para 345.425 pixels no claro e 337.471 no escuro. Considerando somente os pixels idênticos no HTML e no PNG, restaram 77.715 diferenças no claro e 43.894 no escuro. A contagem localizou os desvios de implementação nas áreas em que as duas fontes coincidiam. O aceite usa a imagem completa recapturada do HTML.

A revisão `ec063f4` refinou as linhas do currículo. Na imagem completa, as diferenças frente aos PNGs caíram para 340.768 no claro e 334.252 no escuro. Na área em que HTML e PNG coincidem, restaram 72.780 diferenças no claro e 40.504 no escuro. Essas capturas antecedem a integração do novo cabeçalho.

Pelo critério de aceite escolhido, duas recapturas por tema do HTML original produziram PNGs idênticos com Chrome 158.0.8127.37, DPR 1 e perfil sRGB. A candidata isolada `99879fb` reduziu as diferenças integrais de 407.116 para 367.537 pixels no claro e de 348.454 para 328.003 no escuro. A área do vídeo responde por 211.147 e 208.364 diferenças, respectivamente. O HTML exibe um JPEG de capa no estado inicial. A fixture da candidata reproduziu a capa dentro de um arquivo de vídeo, com diferenças de cor e amostragem introduzidas pela codificação. O logo remoto escuro do HTML continua indisponível. A candidata usa o SVG oficial do Icarus no menu.

Na revisão `6dfe8a9`, a capa privada cadastrada no curso aparece no estado inicial do vídeo Storage após a autorização da aula. A capa sai ao reproduzir e o vídeo continua disponível se ela faltar ou falhar. Na mesma fixture em ambas as revisões, a diferença integral caiu de 385.136 para 218.488 pixels no claro e de 346.339 para 131.127 no escuro. Na região central da mídia restaram 129 e 84 diferenças. O HTML escuro desta rodada usou o SVG autorizado na resposta da imagem indisponível. O estilo original renderiza o SVG preto sobre fundo escuro e a candidata mantém o tratamento de contraste da marca oficial.

Após ajustar a barra de vídeo, as diferenças integrais eram 173.395 pixels no claro e 130.310 no escuro. A revisão `3ca1c54` aproximou a geometria do cabeçalho, da busca e da navegação lateral e reduziu o total para 140.355 e 105.742, respectivamente. Essas medições antecedem a inclusão de Encontros no menu. A comparação integrada com essa entrada ainda está pendente.

## Comparação integral do catálogo

A revisão `293788c` foi comparada com o HTML e o PNG dos pacotes 1 e 3 usando o Shell real e a mesma fixture antes e depois. A comparação usa as dimensões originais de cada PNG. Conta pixels que diferem em qualquer canal RGBA, incluindo transparência, sem redimensionamento, tolerância ou exclusão de regiões.

| Tema | Dimensões | PNG × HTML | Candidata × PNG, antes → depois | Candidata × HTML, antes → depois |
| --- | --- | --- | --- | --- |
| Claro | 1280 × 2249 px | 608.206 | 1.761.780 → 1.177.019 | 1.799.340 → 1.128.080 |
| Escuro | 1280 × 2210 px | 541.459 | 2.822.440 → 1.802.629 | 2.822.518 → 1.714.455 |

O destaque começa na mesma altura que no HTML em ambos os temas. A primeira linha de módulos começa na mesma altura no escuro e difere em menos de 1 px no claro. O conjunto da segunda linha escura ainda ocupa mais altura. A rota de detalhe foi exercitada por navegação. A comparação visual usou o catálogo e a grade exibidos juntos nos arquivos de referência. Capas, avatares e a região final também divergem entre HTML e PNG. Lançamentos, lista de espera, favoritos de cursos, tempo acumulado e dados de mídia e descrição de módulo seguem pendentes.

Com o novo cabeçalho em `760f377`, a comparação com os PNGs registrou 1.177.429 e 1.802.628 diferenças no claro e no escuro. Frente ao HTML renderizado, as diferenças foram 1.128.008 e 1.714.455. Apenas um pixel em cada tema mudou abaixo dos primeiros 64 px em relação à revisão anterior. A fixture confirmou um campo visível, a consulta do catálogo com o termo digitado e o acesso ao detalhe conforme o plano.

Na nova referência de aceite, duas renderizações de cada HTML original produziram PNGs idênticos por tema com Chrome 158.0.8127.37, DPR 1 e perfil sRGB. A candidata isolada `d57b694` reduziu as diferenças de 1.076.773 para 982.497 pixels no claro e de 1.800.552 para 1.580.587 no escuro. A fixture reproduziu a capa da referência pelo fluxo de imagem protegida. Esse arquivo ficou fora do código versionado. O logo escuro do HTML apresentou uma falha de carregamento reproduzível nas duas capturas.

A região abaixo da grade concentra 620.160 diferenças no claro e 829.863 no escuro. Ela inclui lançamentos, lista de espera e uma oferta promocional que exigem dados e ações reais. A candidata do catálogo permanece na frente isolada para os próximos ajustes.

## Verificação funcional do player integrado

No Chrome, o Supabase local autenticou um aluno de teste, autorizou o vídeo privado e entregou a mídia com HTTP 206. O ensaio verificou play, pausa, posição salva e retomada, a busca com teclado, o foco após abrir uma aula e a leitura de um aviso após emitir um certificado. A revisão `ee8ce73` corrige a atualização do sino quando a primeira consulta ainda está em curso. A suíte integrada passou com 164 testes. O teste visual integral do player com o novo cabeçalho, a reprodução Bunny e o WebKit continuam pendentes.

## Primeira prévia com a fundação do Stitch

A prévia local da composição `4835ef6` foi disponibilizada em `http://127.0.0.1:8110`. Inclui os tokens, a busca de Materiais e as molduras de membros e administração. O build, a tipagem e 192 testes passaram. No Chrome, a conta Pro de demonstração autenticou no Supabase local, a moldura mediu 256 × 64 px no desktop e a aula privada recebeu HTTP 200 da função de mídia e carregou os metadados do vídeo Storage. A paridade integral, a sobreposição preexistente de abas do player a 360 px e a homologação externa continuam abertas.

A porta 8110 passou a servir `ead4870`, com ajustes no catálogo, abas do player em duas colunas no mobile e o primeiro glifo Material Symbols local. O build passou e a repetição da suíte com dois processos passou os 193 testes. Chrome autenticado confirmou documento de 360 px sem transbordamento, abas em duas colunas e carregamento da fonte local na aula. A medição do glifo individual e a comparação integral do catálogo têm escopos próprios nos recibos. A paridade integral continua aberta.

## Avatar da discussão aprovado e recapturado

A exceção de 24/11/2026 usa as iniciais AV na conta de referência da discussão P4. A recaptura substitui somente a resposta da imagem de perfil aprovada, preservando o HTML original. O par desktop de 1280 × 3380 px ficou idêntico em RGBA. A medição a 360 px também repetiu, com documento de 1079 px e aceite mobile em aberto. A prévia 8110 passou a servir `1743fc3`, com iniciais dinâmicas no fallback da discussão e foto privada válida nas contas com imagem. Tipagem, autocheck visual e 35 testes focados passaram.

## Gate do instalador local

A composição `0c182a2` incorpora a proteção do daemon dedicado e o upgrade transacional. A revisão independente executou os 29 lotes em PostgreSQL 17.5 em memória, conferiu o catálogo resultante contra a aplicação dos arquivos originais e verificou rollback de DDL e histórico durante falhas na transição 028 → 029. A reexecução aplicou a 029 uma vez. O próximo aceite segue o ambiente isolado e o roteiro descritos em [Operação](../operations.md), incluindo Docker e Supabase nativos, backup/restauração e fluxo HTTP. O checkout de integração tem a revisão local e a publicação segue pendente.

## Primeira prévia com os exports mobile de 360 px

A porta 8110 serve `17cc7ef`, com moldura e corpos mobile de Catálogo, Fórum e Player, atualização de Conta e Onboarding, guia reposicionado e correções de contraste e foco. O build foi servido com os assets conferidos e a suíte completa passou com 213 testes. Chrome com Auth nativo e a conta Pro da demo confirmou a navegação inferior entre Catálogo e Comunidade, retorno de foco, documento de 360 px, media Edge HTTP 200 e Voltar único do Player até o módulo. O clique de conclusão e o fluxo de erro da inscrição foram cobertos nas respectivas fixtures. A comparação integral com os novos HTMLs e a revisão independente seguem abertas.

## Podcasts, suporte e checkout na candidata

A composição `16de753` integra o acervo e o editor de Podcasts, a central e a conversa de suporte, a fila administrativa e o visual do checkout hospedado. O build e 219 testes passaram. Auth e PostgREST locais confirmaram HTTP 200 para o catálogo de Podcasts do aluno Pro, HTTP 401 na consulta anônima e recusa do modo administrativo ao aluno. O catálogo local está vazio. Cadastro, publicação, capítulo e marcação após recarga foram exercitados na fixture com SQL real e sessão sintética.

O suporte e o checkout passaram nas fixtures nos dois temas e a 360 px. A exportação das marcações de Podcasts, a reprodução autorizada no YouTube, a operação Asaas Sandbox e o aceite visual integral estão em validação. Durante essa rodada, a prévia 8110 ainda servia `17cc7ef`.

## Painéis comerciais na candidata

A composição `2282ec7` inclui Membros e CRM, Planos e Ofertas e Pedidos e Faturamento com a Fundação Stitch. A ajuda aponta para a ação Abrir ficha e a exportação continua acessível no guia. O build e 220 testes passaram. As 12 combinações de painel, tema e largura (360 e 1280 px) passaram no Chrome com fixtures, incluindo navegação, busca, exportação CSV, erro e recuperação no editor e revisão da cortesia antes da confirmação. No PostgREST local, uma conta de aluno autenticada recebeu recusa nas três listas e na ficha administrativa.

As três referências desktop repetiram zero divergências RGBA entre recapturas. O comparador recusou a comparação com o app por estado não equivalente. A paridade visual, a gravação de planos com Auth nativo e as operações dos provedores continuam em aberto.

## Prévia com as correções de navegação do Player

A porta 8110 passou a servir `fe77a06`, com a nova composição de Podcasts, Suporte, Checkout e painéis comerciais. Build e 221 testes passaram. O Chrome com fixtures confirmou a 360 px, em ambos os temas, o foco durante a retomada, a retentativa após HTTP 503, o toque no play com erro visível, Voltar único e foco após conclusão. Confirmou também a continuidade de foco em 639/640 px e a visibilidade da aba Anotações. No Chrome com Auth e PostgREST locais, a navegação Catálogo–Comunidade manteve o foco, o Player Storage privado carregou, e o catálogo de Podcasts abriu com HTTP 200 enquanto a gestão recusou a conta de aluno. O aceite visual e a homologação dos provedores externos continuam em aberto.

## Suporte com Auth e Storage locais

O ensaio de `e93b99b`, com os mesmos arquivos de suporte e checkout da prévia `fe77a06`, confirmou abertura, resposta e reabertura de chamado em AJAX. O aluno titular recuperou o arquivo privado por URL assinada. Outro aluno recebeu recusa no navegador e nas operações diretas de leitura, resposta, upload e assinatura. Suporte e Admin só acessaram a conversa e o anexo após desafio TOTP com AAL2. A remoção das fixtures por ID deixou zero resíduos nas 20 tabelas conferidas.

A consulta local de capacidades retornou `asaas: false`. O Asaas Sandbox e o aceite visual integral continuam pendentes.

## CRM e exportação de marcações de Podcasts

O ensaio comercial com Auth e PostgREST locais confirmou buscas de Membros, Planos e Pedidos e a recusa dos fluxos administrativos ao aluno. Senha inválida e autorização ausente, nula, inválida ou reutilizada foram recusadas. A concessão de cortesia, a atualização do perfil, o consumo da autorização e a auditoria foram registrados na mesma transação. A limpeza das fixtures deixou zero resíduos nas 28 verificações e na segunda consulta SQL.

A migration 030 inclui somente os IDs de episódios marcados pelo titular no export e conserva o JSON anterior. A revisão independente conferiu ACL, vínculo entre ator e sessão, rollback e funcionamento após revogação de assinatura. A suíte ampliada passou em 380 assertivas no PostgreSQL 14 isolado. Em PostgreSQL 17.5 em memória, as 30 migrations, o rollback da 030 e 152 assertivas de Podcasts, lançamentos e notificações passaram. A prévia usa o banco até a 029. O ensaio Auth/PostgREST da 030 e a instalação nativa completa seguem em validação.

## Equipe, Auditoria, Asaas e Bunny na prévia

A prévia local passou a servir `807997c`. A composição inclui Equipe, busca de eventos em Auditoria e painéis de configuração para Asaas e Bunny. O build e 222 testes passaram. No Chrome autenticado a 360 px, a consulta de configuração e a busca de auditoria retornaram HTTP 200. O ambiente declarou Asaas e Bunny como `Não configurado`. O guia abriu a ajuda de Administração. A navegação de membros e o carregamento da aula privada também passaram após a atualização da prévia.

A frente isolada verificou 16 cenários em Chrome, nos dois temas e larguras, e 20 acessos recusados. Na integração, os pares a 360 px apresentaram três pixels de diferença no Bunny escuro em uma execução e dois em Equipe clara em duas execuções. Os hashes das duas capturas de Equipe se repetiram entre execuções e diferiram entre a primeira e a segunda captura de cada par. A comparação integral com o Stitch segue em aberto. As credenciais, métricas de provedores, convites de equipe e auditoria avançada dependem dos contratos ou da configuração correspondentes. O banco da prévia continua até a 029.

## Ranking em revisão independente

A frente `fe61385` entregou a primeira classificação mensal e geral, pódio, posição do membro e cinco fontes de pontuação. A prova independente da coordenação em PostgreSQL 14 isolado executou a mesma suíte `backend.sql` antes e depois da 033, com 109 assertivas e rollback em cada execução. As 35 verificações dedicadas do Ranking também passaram e as três tabelas consultadas ficaram sem resíduos. O ensaio usou as migrations 001–030 e adicionou a 033 em uma cópia do banco. A composição com 031 e 032, a revisão dos gatilhos e o ensaio nativo de Auth e PostgREST seguem pendentes.

A posição é preliminar. O fechamento, os critérios de desempate e os limites diários precisam de definição antes da apuração de vencedores. A prévia 8110 não recebeu a 033.

## Feedbacks, Dashboard e Analytics na candidata

As migrations 031 e 032 entraram na composição local com rotas, menu, ajuda e guia. Feedbacks administrativos e os dois relatórios exigem admin AAL2. A tela de Analytics indica a cobertura dos dados de progresso. A revisão aprovou os controles de acesso e identificou correções no reenvio de Feedbacks e na primeira ativação do Dashboard. A prévia 8110 usa o banco até a 029.

O build, 228 testes React e 35 de Edge passaram. No PostgreSQL 14 isolado, foram aplicadas em ordem as 32 migrations e passaram 18 suítes, com 926 verificações e rollback. O bootstrap de teste reproduziu Storage e Auth e alinhou a ACL anterior de `app_save_post` à conferida na instalação local. As cinco tabelas verificadas ficaram sem resíduos. O ensaio nativo de ponta a ponta da composição completa e o aceite visual seguem pendentes.

Com Chrome e Auth reais em uma origem temporária, as três rotas administrativas recusaram o aluno. O admin sem autenticador recebeu a ação Configurar segundo fator. A verificação registrou zero consultas de relatório ou triagem para essas duas contas. A revisão independente do Ranking reproduziu o cancelamento de voto e moderação durante uma edição administrativa de perfil, mantendo a 033 fora da candidata até a correção.

A correção de Feedbacks cobre reenvio após perda de resposta, atualização da situação após conflito, extensão de arquivo e retorno mínimo da finalização. A correção do Dashboard cobre pedidos vinculados após o fim da vigência. Analytics diferencia a navegação de páginas de cursos e aulas. As duas frentes trabalham em cópias isoladas. A origem temporária confirmou acesso anônimo ao upload recusado com HTTP 401 e outra origem recusada com HTTP 403. A 8110 segue com a revisão anterior.

## Consumo do nome e reteste de Analytics

A moldura pública usa o nome do contexto público e a moldura autenticada usa o nome do bootstrap. O valor padrão Icarus exibe a marca oficial. Um nome personalizado ocupa o espaço da marca como texto. O build e 231 testes passaram. O Chrome a 360 px, com Auth local e valor de 80 caracteres fornecido pela fixture, confirmou a apresentação do nome sem transbordamento nos dois temas. O editor e a migration 034 seguem em correção e o banco da prévia ainda não tem a personalização.

A 032 inclui apenas primeiras ativações que geraram uma janela efetiva de acesso. Analytics diferencia por nome acessível os paginadores de cursos e aulas. Uma cópia PostgreSQL com 031, 032 corrigida e 033 em revisão passou em 48 verificações de Analytics, 58 de Feedbacks, 42 de Ranking e 15 de exportação de Podcasts, além de 237 verificações de backend e comunidade. A 033 continua fora da candidata até o reteste independente.

## Composição das 34 migrations

O Ranking preliminar entrou na candidata com rota, menu e guia. O reteste independente aprovou a correção da contenção entre edição de perfil, voto e aprovação. Pódio e lista exibem a projeção mínima. A corrida em exclusões físicas simultâneas ficou registrada no contrato do futuro executor de expurgo.

A 034 com revisão monotônica, validação do nome e guarda de sessão foi composta com as migrations anteriores. Passaram 235 testes React, 37 de Edge e 1.008 verificações em 20 suítes SQL com rollback no PostgreSQL 14 isolado, com zero resíduos nas seis tabelas conferidas. O reteste de Marca e as correções restantes de Feedbacks antecedem a atualização da prévia. A validação nativa completa e o aceite visual continuam abertos.

O ensaio do instalador em PostgreSQL isolado executou o SQL de upgrade real da 029 à 034. Uma falha induzida entre o DDL da 034 e o registro da versão manteve o histórico na 033 e reverteu a tabela e a RPC novas. A repetição registrou as 34 versões uma vez. O ensaio nativo do instalador com Docker dedicado segue pendente.


## Atualização da prévia local

O reteste independente aprovou a correção de sessão, Unicode e revisão da Marca. A revisão `6c98d2e` integrou a correção de Feedbacks que preserva o rascunho após recusa definitiva do print e protege a revisão mais nova da triagem. Passaram build, 240 testes React e 37 testes Edge.

A atualização da prévia aplicou de forma transacional as migrations 030–034 ao PostgreSQL 17 do Supabase local após verificar o backup da 029. O histórico registrou 34 versões. Auth e PostgREST confirmaram a leitura do Ranking, o nome nas duas consultas e o export com as chaves de Podcasts, Feedbacks e Ranking. Uma conta de aluno recebeu recusa nas RPCs de Dashboard, Analytics e fila de Feedbacks. O upload recusou acesso sem sessão e requisição de outra origem.

No Chrome a 360 px, a conta de teste navegou entre Catálogo e Comunidade pelo teclado, abriu o Player com mídia privada e retornou ao módulo pelo único controle Voltar. O Ranking abriu com HTTP 200 e o modal de Feedback devolveu o foco ao gatilho ao fechar por Escape. A revisão visual, as provas de provedores externos e o ensaio nativo do instalador seguem pendentes.


## Ajustes de Catálogo, Fórum e Player a 360 px

A prévia local passou a servir `12e1d50`, com os ajustes de Player (`ef4ec7f`), Catálogo (`9b61514`) e Fórum. O build e 240 testes React passaram. Os seis HTMLs mobile dedicados repetiram suas capturas em cada tema. As capturas desktop do app repetiram os pixels anteriores nas três frentes.

| Tela e área medida em RGBA | Claro, antes → depois | Escuro, antes → depois |
| --- | ---: | ---: |
| Player, linhas comuns a partir do topo | 315.975 → 275.899 | 391.066 → 358.360 |
| Catálogo, união dos documentos com alturas diferentes | 820.766 → 817.897 | 771.007 → 747.287 |
| Fórum, quadro inicial de 360 × 880 px | 183.740 → 182.818 | 212.062 → 211.642 |

No Fórum, o ajuste integrado do compositor escuro reduziu sua divergência de 15.016 para 13.440 pixels sem mudar a altura da página. O recorte do compositor claro ficou com 47 pixels a mais, com redução de 3.938 nas linhas comuns do documento claro. A comparação usou as mesmas fixtures, viewport, Chrome e escala dos recibos.

As três telas seguem com dimensões integrais ou estados diferentes do HTML. As diferenças incluem os dados e indicadores de progresso, os campos editoriais e as ações da comunidade, fontes e ícones e a moldura compartilhada. Os resultados da tabela são diagnósticos. A avaliação de entrega usa capturas e estados comparáveis e observa as diferenças perceptíveis de composição.


## Moldura mobile compartilhada

A prévia passou a servir `cd48ff8`, com a moldura integrada em `0ee0346`. O topo de Catálogo e Fórum exibe o plano da conta junto à marca. A barra inferior inclui Ranking nos dois temas. Materiais aparece na barra clara e permanece acessível pelo menu nos dois temas. A aula conserva o retorno ao módulo e segue sem barra inferior. A ajuda e o guia indicam os atalhos reais.

| Tela | Topo claro | Topo escuro | Barra clara | Barra escura |
| --- | ---: | ---: | ---: | ---: |
| Catálogo | 3.704 → 3.654 | 4.814 → 4.376 | 21.080 → 21.046 | 20.913 → 20.886 |
| Fórum | 3.700 → 3.650 | 4.816 → 4.359 | 18.937 → 18.917 | 20.089 → 19.963 |
| Player | 3.940 → 3.672 | 2.361 → 1.678 | Sem barra | Sem barra |

A comparação registra pixels RGBA diferentes nos recortes fixos da prévia a 360 × 880 contra os HTMLs mobile recapturados. Os oito pares desktop repetiram os pixels da revisão anterior. Build e 241 testes passaram. No Chrome com Auth local, a navegação por teclado abriu Comunidade e Ranking a partir da barra, confirmou a entrada de Materiais e preservou foco, largura de 360 px e retorno da aula com mídia privada.

Os glifos, a marca ilustrativa, os dados de cada documento e as dimensões integrais ainda diferem do Stitch. O destino Início das barras claras do protótipo continua sem tela própria para o aluno. A revisão considera quais dessas diferenças ainda afetam o acabamento ou a compreensão em cada estado.


## Revisão visual de entrega

A comparação lado a lado das 28 referências usou capturas existentes e priorizou estrutura, hierarquia, leitura e componentes principais. Dezoito referências passaram direto. Ranking e Onboarding passaram após os ajustes de `695c256`. O build e 241 testes passaram. As fixtures de navegador confirmaram pódio, posição própria, paginação e estados do Ranking, além do progresso e do envio do Onboarding nos dois temas a 360 px.

| Família | Seguem | Em ajuste |
| --- | --- | --- |
| Área do aluno | Player claro e escuro, Encontros, Materiais, Certificados, Podcasts, Catálogo claro e escuro, Fórum e Discussão desktop | |
| Administração | Analytics, Membros e CRM, Planos e Ofertas, Feedbacks, Equipe e Auditoria, Bunny, Marca, Tickets, Dashboard, Cursos e Aulas, Pedidos | |
| Conta e fluxos independentes | Suporte, Configurações, Checkout, Verificação Pública, Ranking, Onboarding | |

Asaas permanece como a referência administrativa condicionada ao escopo operacional. A fixture com configuração detectada confirmou a composição dos três painéis a 1280 e 360 px e o fluxo de atualização. Os indicadores financeiros e os controles de produção do protótipo dependem de dados e contratos que a interface atual não oferece. A prova do Sandbox com o provedor permanece pendente.


## Ícones locais na moldura mobile

A prévia passou a servir `ac23570` com 12 glifos do Stitch nas ações equivalentes de Catálogo, Fórum e Player. A fonte Material Symbols Outlined de 3.088 bytes é servida na própria origem. A licença e o SHA estão no [registro de ativos](../../public/vendor/material-symbols/README.md).

Build e 241 testes passaram. O Chrome da prévia confirmou download da fonte, navegação e foco a 360 px. Um HTTP 404 simulado para a fonte preservou os ícones de reserva e o mesmo fluxo. O ensaio isolado registrou ausência de download da fonte da moldura em desktop e capturas desktop idênticas às anteriores. Os ajustes de composição identificados na revisão de entrega continuam em andamento.


## Acabamento do Catálogo e da Comunidade

A prévia `f61464a` inclui Catálogo (`3c4cea8`) e Comunidade (`b887780`), com ajuda e guia atualizados. Vinte e quatro das 28 referências seguem na revisão visual. Dashboard, Cursos e Aulas e Pedidos estão em ajuste. Asaas aguarda o escopo operacional registrado acima.

Lançamento em breve fica logo após a grade, antes de Próximos módulos e da paginação. Os cards usam título, previsão e resumo cadastrados. O contrato atual oferece esses campos e o estado da inscrição. A área de destaque usa tipografia e superfícies do Icarus.

O Fórum distingue autoria, anexos e respostas e leva ao Ranking e à ajuda pela lateral desktop. Na Discussão desktop, o texto longo ganhou uma coluna de leitura mais estreita, com ações e respostas separadas e acesso às publicações do espaço quando autorizado. O reflow a 360 px está conferido nos dois temas. A referência dedicada da Discussão continua indisponível.

O build e 242 testes passaram. A conta de teste consultou lançamentos e fórum via Auth e PostgREST na prévia. O Catálogo retornou uma lista vazia na sessão local. As inscrições, a falha com retentativa e os estados da Discussão com conteúdo foram exercitados com fixtures.


## Acabamento administrativo e pacote da candidata

A prévia `90c629b` inclui os ajustes de Dashboard, Cursos e Aulas e Pedidos. Os indicadores monetários preservam centavos quando presentes e o Dashboard reorganiza os cartões conforme a largura. No currículo, Reordenar revela os controles de ordem. A edição agrupa mídia, prévia autorizada e apresentação da aula. Em Pedidos, o filtro por situação se aplica à consulta paginada e ao CSV. Busca por ID ou valor consulta todas as situações.

A revisão visual tem 27 das 28 referências liberadas. O Gateway Asaas continua com a pendência operacional registrada na triagem. Para a Discussão, a leitura a 360 px foi validada com o design system e a comparação direta aguarda um export dedicado. Os ajustes administrativos passaram em build, 243 testes de interface e 37 testes Edge. A repetição dos três fluxos em Chrome sobre a composição integrada usou fixtures de AAL2, reordenação, falhas de gravação, upload, filtro paginado e CSV.

O archive de `90c629b` contém a licença MIT, o lockfile, o guia de operações e as 34 migrações. Passaram a instalação das dependências a partir do archive, o build e 22 cenários do instalador com dublês. O aceite nativo em daemon Docker dedicado e a homologação de provedores externos continuam pendentes.


## Segundo fator opcional na administração

A prévia `cb2c716` recomenda o segundo fator em Sua conta → Segurança. Dashboard, Analytics e Feedbacks usam a regra de sessão do restante da administração. A migration `035` exige papel administrativo nas RPCs e preserva o gate de prints privados. Uma conta com autenticador verificado precisa apresentar JWT e sessão nativa com segundo fator confirmado para executar ações protegidas.

Passaram build, 242 testes de interface, 37 de Edge e 1.014 verificações em 20 suítes SQL isoladas. No Chrome, o admin de demonstração sem autenticador abriu as três telas com HTTP 200 e encontrou a opção de ativação. Uma conta sintética com Auth e PostgREST locais repetiu acesso antes da ativação, matrícula TOTP, acesso com código, recusa em uma segunda sessão até confirmar o código e retorno ao acesso sem código após remover o fator. A conta de QA foi removida.
