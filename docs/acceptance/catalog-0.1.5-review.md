disposition: ship

Entradas não fornecidas: cartão QUALITY BAR separado e contrato formal em cinco blocos com seed; o brief, PRODUCT.md, DESIGN.md e CONTRACT.md da proposta fixam esta extensão do mundo existente, sem nova escolha de identidade ou rodada de conceito. Não li nem executei Auth, segredos, backend, suítes, build, navegador ou detector nesta revisão.

## persistence

Pass. PRODUCT.md e DESIGN.md existem e descrevem o mundo efetivamente entregue: Inter auto-hospedada, monocromia, claro inicial e preferência escura existente. Trata-se de integração em código de uma proposta navegável aprovada pelo usuário, não de reprodução raster comp-led; state/spec/comp-diff e concept-seed não foram usados como requisitos novos de aprovação. A aprovação citada no despacho fixa composição, não os nove cursos fictícios ou temas da proposta.

Conferi o diff de 61ca9d14ff3e3d805f7ba5681b9685147e5e83cd até o estado de trabalho, os 14 hashes de inputs-final.json (todos iguais, inclusive na releitura final), e os hashes/dimensões das 19 imagens selecionadas (todos iguais). Abri as 19 imagens e as duas capturas claras da proposta: conteúdo válido, topo presente nos quadros de scroll zero e dimensões 1440×900/360×800 compatíveis; recortes inferiores estão identificados pelo scroll. As áreas pretas pertencem ao tema/capas, sem região vazia anômala demonstrada.

Li os cinco consumidores de Search: AdminList, ajuda, comunidade, catálogo e materiais, além de Search/RouteFocus, PrivateImage, useRpc, DTO, rotas e detalhe conectado. Search mantém a mesma instância com estado sincronizado ao parâmetro; a exceção de RouteFocus exige mesmo pathname, navegação diferente de POP e foco no formulário de busca. Paginação e links fora do formulário continuam no ramo de foco/scroll existente; não encontrei regressão demonstrada nesses consumidores. app_catalog mantém p_query/p_page; a página usa os metadados retornados, sem prefetch ou concessão de acesso. As capas cadastradas continuam passando por PrivateImage; links abrem o detalhe SPA existente com slug codificado.

Ajuda, tour, docs/help/README.md e docs/acceptance/catalog-0.1.5.md acompanham a extensão. DESIGN.md continua compatível; não há necessidade demonstrada de alterar identidade, tokens ou DESIGN.json para esta composição. docs/analysis/design.md é explicitamente planejamento anterior, e seu contrato mínimo de Cursos permanece atendido.

Li tests-final.log (67 testes/9 arquivos), build-final.log (tsc/build concluídos e aviso de chunk >500 kB), os 17 casos do teste dirigido e os recibos guide-help/native-interactions/controlled-interactions. São verificações relatadas pelo coordenador, não testes meus; os fracassos/timeout anteriores não foram convertidos em aprovação. Não reexecutei nada.

## fidelity

| Elemento saliente | Estado | Evidência e fundamento |
| --- | --- | --- |
| Shell, título, introdução e ordem de leitura | match | Proposta desktop/mobile versus capturas nativas e controladas: contexto → destaque → busca → fileiras. Shell real mantém o guia existente. |
| Destaque bipartido desktop, texto/ação no mobile | match | final-native-catalog-1440-light-0.png, final-settled-1440-dark-0.png e final-settled-360-{light,dark}-0.png; a capa decorativa sai no mobile conforme CONTRACT.md da proposta. |
| TYPE | match | Inter, peso forte, tracking controlado, contraste e relação display/títulos/corpo preservados. Títulos reais longos quebram ou truncam apenas a capa decorativa, com título completo no link do curso. |
| MATERIAL | match | A proposta usa composição tipográfica plana, e a integração mantém esse material sem inventar arte; CourseCover usa o título real ou PrivateImage quando cadastrado. Sem obrigação de fotografias ou placas raster fictícias. |
| GROUND | match | Branco/cinza neutro/preto no claro e preto/cinza neutro no escuro, coerentes com as imagens e tokens Icarus; nenhuma deriva cromática visível. |
| Fileiras e navegação lateral | match | controlled-nine-courses em 1440/360 nos dois temas mostram cartões, pistas de continuidade e setas. Trilhos são regiões focáveis com scroll nativo; limites e reduced-motion tratados no código. Recibo controlado registra ida/volta, sem alegação de teste meu. |
| Conteúdo/progresso do destaque e retomada | adaptation | Brief manda usar andamento acessível confirmado pelo servidor. featured prefere inProgress, depois curso acessível; hero não reaparece nas fileiras. A ausência da fileira de retomada com apenas um curso em andamento é consequência dos dados, não falta de composição. |
| Categorias/temas da proposta | adaptation | Brief explicita ausência de categoria no DTO: a integração usa Continue aprendendo e Explore os cursos, sem inventar temas ou recomendações. |
| Busca/paginação/escopo | adaptation | Brief preserva contrato de 20 itens. Texto informa faixa, total e página; controlado com 9 DTOs/total 29 explicita o recorte, sem tratá-lo como resposta real do backend. |
| Destino do curso | adaptation | Diálogo simulado da proposta substituído por Link ao detalhe SPA real, conforme autorização de integração. Acesso continua decidido no servidor. |
| Vazio, loading, erro/retry e restrito | match | native-empty em desktop/mobile mostra recuperação; QueryState mantém loading/erro/retry; botão Consultar acesso e cadeado permanecem sem conceder acesso. Estados não capturados foram avaliados no código e testes lidos, sem prova visual própria desses estados. |
| Verdade dos dados | match | Capturas nativas usam fixtures identificadas do servidor local; controladas dizem DEMONSTRAÇÃO VISUAL e são só transporte. Não há curso fictício, preço ou prova comercial acrescentados ao catálogo de produção por este delta. |

## ceiling

Reached no recorte fornecido: composição editorial tipográfica, destaque de escala maior, contraste monocromático, fileiras com continuidade e conteúdo real do DTO. Não identifiquei recurso nativo exigido pela proposta deixado de fora. O cartão QUALITY BAR separado não foi disponibilizado, portanto não há pontuação independente contra esse cartão. A evidência não cobre outros breakpoints, zoom, dispositivos físicos, leitores de tela, outros motores, provedores ou produção; DTO restrito controlado não prova autorização backend.

## material_fixes

Nenhum defeito material demonstrado neste delta. Disposition ship restrita à integração revisada e à seleção de evidências pinada; não aprova todas as telas, infraestrutura, Auth ou homologação externa.

## keep

Preservar a composição aprovada, o DS oficial, a origem servidor de acesso/progresso, a mídia privada, o recorte explícito da página, a busca sem reload com foco preservado e a ajuda/tour sincronizados.
