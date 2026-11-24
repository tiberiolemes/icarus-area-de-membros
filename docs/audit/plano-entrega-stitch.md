# Plano de reconstrução do design system do Icarus

**O Stitch define o design system e as telas do Icarus.** Os quatro pacotes entregues contêm 28 HTMLs e cinco arquivos `DESIGN.md`. A comparação dos arquivos por SHA-256 identificou dois guias distintos, um claro e um escuro. A reconstrução começa por esses guias e confirma os padrões nos HTMLs renderizados. O [inventário de paridade](stitch-paridade.md) reúne as 28 referências.

## Fontes e regras de leitura

| Fonte | O que define |
| --- | --- |
| `monochrome_minimalist_saas_light_mode/DESIGN.md`, pacotes 1 e 3, e `monochrome_minimalist_saas/DESIGN.md`, pacotes 2, 3 e 4 | A especificação de cores, tipografia, espaçamento, raios, superfícies, elevação, ícones e padrões de componentes. |
| `code.html` original de cada tela, renderizado e recapturado | A composição final, os valores aplicados pelo protótipo, a geometria, os ativos e os estados visuais. Quando o guia do Stitch e o HTML divergem em uma tela, o HTML define a variante daquela tela. |
| PRD e [contrato da aplicação](../CONTRACT.md) | Fluxos, dados, persistência, permissões, integrações e estados operacionais. |

O [guia atual do repositório](../../DESIGN.md), o [arquivo de tokens anterior](../../public/brand/icarus-tokens.css) e os estilos existentes são o ponto de partida da migração. Atualizar o guia do repositório e a declaração de autoridade visual no [contexto do produto](../../PRODUCT.md) junto com os novos tokens.

A autorização de uso do SVG oficial do pacote 3 se aplica à resposta da URL indisponível da marca nas recapturas. Em 24/11/2026, Tibério aprovou também o avatar com as iniciais do usuário como referência da discussão do fórum. Essa exceção cobre somente a imagem de perfil indisponível da discussão. Preservar os arquivos HTML e CSS originais e registrar a alteração aplicada durante a recaptura. Registrar fontes, ícones e demais ativos que precisem de confirmação para distribuição.

## Base identificada nos arquivos

| Elemento | Padrão encontrado | Como reconstruir |
| --- | --- | --- |
| Cores e superfícies | No claro, branco para cards, `#F4F4F5` para controles, `#E4E4E7` para divisórias e `#09090B` para títulos. O fundo do player claro é `#F8F9FA` e o do catálogo claro é `#FAFAFA`. No escuro, `#131313` é o fundo recorrente, `#0E0E0E` a superfície da navegação de membros e `#E5E2E1` a cor de texto principal. | Compartilhar os valores por função e tema. Registrar a fonte e o contexto de cada variante. Separar fundo da página, lateral, painel, controle, seleção e divisória. |
| Tipografia e ícones | Inter nos dois guias. Corpo médio de 14 px com entrelinha de 20 px no claro e 22 px no escuro nos guias. Material Symbols Outlined aparece nas referências. | Recriar os estilos de título, corpo e rótulo com tamanho, peso, entrelinha e espaçamento entre letras. Conferir os valores efetivamente usados por tela e a fonte de ícones com o navegador. |
| Espaçamento e formas | Os guias especificam espaços de 4, 8, 16, 24 e 40 px, margem de 32 px, calha de 24 px e raios de 4, 8, 12, 16 e 24 px, além de formas em cápsula. Os HTMLs também usam raios e medidas específicos. | Usar a escala do Stitch no CSS compartilhado e definir as variantes com base nas classes e medidas aplicadas no HTML. |
| Moldura de membros | Treze HTMLs usam lateral de 256 px e cabeçalho de 64 px. O conjunto recorrente contém marca, menu, busca, sino e conta. A discussão tem variante de superfície e borda. | Reaproveitar a estrutura do [Shell](../../src/shell.tsx). Modelar as variações de aparência por tema e rota e verificar navegação, gaveta, teclado e foco. |
| Moldura administrativa | Doze HTMLs usam lateral de 288 px e cabeçalho de 64 px. Os HTMLs têm variantes de superfície da lateral e do cabeçalho. | Compartilhar a estrutura com a área de membros e usar os tokens e o menu da variante administrativa. Exercitar as permissões com os papéis do produto. |
| Fluxos independentes | Checkout, onboarding e verificação pública usam cabeçalhos e composições próprios. | Compartilhar tokens e controles compatíveis. Montar cada fluxo com a estrutura e os estados visuais da referência. |

## Componentes e estruturas de página

Reaproveitar [os componentes existentes](../../src/ui.tsx) quando sua estrutura continuar adequada. Já há primitivas de abas, cabeçalhos, formulários, feedback e paginação. Cada componente visual compartilhado deve ter uso equivalente comprovado nas referências, com variantes de aparência e interação quando o HTML exigir. O catálogo de componentes deve registrar os estados padrão, foco, ativo, desabilitado, erro e carregamento conforme se apliquem.

| Família | Blocos que podem ser compartilhados | Composição específica da rota |
| --- | --- | --- |
| Vitrine e acervo | Título, filtros, abas, grade, card e paginação | Destaque, capa, proporções, metadados e ações de cursos, materiais, certificados, encontros e podcasts. |
| Detalhe e conversa | Caminho de navegação, barra de ações, coluna principal e painel contextual | Player e currículo, publicação e respostas, ticket e situação. A referência da rota define a ordem dos blocos. |
| Conta e editores | Título, abas, painéis, campos e feedback | Perfil, preferências, edição de cursos, aulas, planos, integrações e equipe. Abas internas e links de navegação preservam suas interações próprias. |
| Filas e indicadores | Cabeçalho de página, filtros, tabela ou lista de dados e paginação | Colunas, métricas, alertas e ações de membros, pedidos, suporte, moderação, analytics e feedback. |
| Acesso e fluxos independentes | Marca, campos, indicador de etapa, ação e resultado | Etapas, conteúdo, redirecionamentos e estados de cada fluxo. |

## Ordem de entrega

| Etapa | Saída que libera a próxima |
| --- | --- |
| 1. Extrair e conferir a fundação | Mapa de tokens e componentes ligado ao pacote, ao HTML e aos estilos computados. Reconstruir as escalas clara e escura. Conferir lado a lado player e catálogo nos dois temas, conta e encontros no escuro e uma tela administrativa para validar a segunda geometria da lateral. |
| 2. Colocar a fundação no app | Atualizar o CSS compartilhado, a documentação de design e as molduras. Validar os pilotos na dimensão da referência e a 360 px. Só distribuir um componente quando os usos representativos estiverem conferidos. |
| 3. Compor as páginas em paralelo | Separar aprendizagem e acervo, comunidade e suporte, conta e administração, e fluxos independentes. Cada frente consome a base comum, registra suas variantes e fecha as ações e os estados do PRD no inventário das 28 referências. |
| 4. Homologar e publicar | Aprovar o visual e os fluxos por rota. Validar a instalação do zero em ambiente isolado, as migrations, a atualização de uma instalação anterior e o guia PT/EN. Publicar no GitHub com MIT após revisão independente. A instância própria segue depois. |

A fase 1 do PRD orienta o primeiro roteiro funcional, com cadastro, onboarding, compra em sandbox, aula, progresso, materiais, certificado e suporte. As demais frentes permanecem no inventário.

## Aceite

- **Visual por tela.** Em 24/11/2026, Tibério aprovou seguir com telas bem acabadas e cerca de 90% fiéis ao Stitch. Conferir lado a lado a estrutura, a hierarquia, a tipografia, as cores, o espaçamento e os componentes principais. Reaproveitar as capturas existentes quando correspondem à versão e ao estado avaliados. Recortes e contagens de pixels servem para localizar diferenças. Ajustes pequenos de ícone, fonte ou espaçamento são aceitáveis quando o conjunto preserva a aparência e a leitura.
- **Comportamento por rota.** Validar teclado, foco, AJAX, entradas preservadas após erro, papéis, planos, persistência e os estados de carregamento, vazio, erro e bloqueio. Usar 360 px e ambos os temas nas superfícies que os oferecem. Ações que dependem de serviços usam Supabase local, sandbox ou mídia autorizada.
- **Conflitos com requisitos do produto.** Registrar exemplos como controles desenhados abaixo de 44 px, campos abaixo de 16 px e a marca escura com contraste de 1,09:1 na recaptura. Preservar acessibilidade e comportamento de produto. Encaminhar para decisão apenas conflitos que afetem a composição, a compreensão ou o uso.


### Recomendação para o aceite em 360 px

A coleta de 360 px encontrou transbordamento em 26 dos 28 HTMLs, incluindo o documento de 1079 px da discussão. A proposta é preservar a referência original de desktop e manter também os HTMLs que já cabem na largura móvel. Para os demais, produzir e aprovar uma referência mobile a partir de uma cópia do HTML do Stitch, com ajustes de responsividade documentados por família de página.

A referência mobile preserva tipografia, cores, ícones, conteúdo, hierarquia, estados e ações. Os ajustes tratam o encaixe dos blocos, como trocar a lateral por uma gaveta, empilhar colunas e redistribuir abas. O documento deve caber a 360 px. Quando aprovada e recapturada, essa referência orienta a avaliação do app a 360 px. Usar uma referência independente evita usar a própria implementação como padrão de comparação. Esta proposta aguarda decisão sobre a referência mobile.

### Primeiro lote mobile recebido

Em 24/11/2026, o pacote `stitch_icarus` passou a fornecer a referência dedicada em 360 px para Fórum, Catálogo e Player nos dois temas. Os seis HTMLs cabem em 360 px e repetiram a captura integral. Usar esses HTMLs recapturados no aceite mobile das três rotas. Os [comandos e recibos de recaptura](../../tests/visual/README.md#exports-mobile-dedicados-do-stitch) registram os tamanhos das páginas e a origem de cada referência. Nas rotas sem export dedicado, aplicar o design system ao reflow de 360 px e verificar leitura, hierarquia e funcionamento.
