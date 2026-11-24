# Design Icarus

O Stitch define o design system e a aparência das telas. Os cinco arquivos `DESIGN.md` dos quatro [pacotes inventariados](docs/audit/stitch-paridade.md) contêm dois guias distintos. O guia claro está nos pacotes 1 e 3 em `monochrome_minimalist_saas_light_mode`. O escuro está nos pacotes 2, 3 e 4 em `monochrome_minimalist_saas`. As classes e os valores computados do HTML original, renderizado e recapturado, decidem a composição, os ativos e as variantes de cada tela.

O PRD, o [contrato](docs/CONTRACT.md) e a [análise de fluxos](docs/analysis/design.md) definem dados, acesso por papel e plano, estados da aplicação e persistência. Para aparência, as medidas dos guias e dos HTMLs substituem as propostas visuais anteriores da análise. O claro é inicial. A aplicação restaura a preferência salva por usuário e aplica `data-theme` na raiz.

## Tokens e migração

[src/stitch-tokens.css](src/stitch-tokens.css) oferece `--stitch-*` em `:root` e as variantes em `[data-theme="dark"]`. O [CSS global](src/style.css) disponibiliza os tokens. Cada componente escolhe os tokens por função e aplica a variante da sua referência. Migrar o consumidor ao trabalhar na sua frente, conferindo as dependências e os estados nos dois temas. O arquivo anterior `public/brand/icarus-tokens.css` continua fornecendo `--ic-*` às telas e controles que ainda os usam. Substituições globais de `--ic-*` mudariam consumidores com composições próprias.

## Tipografia

A aplicação usa Inter auto-hospedada em `public/brand/InterVariable.woff2`, com licença ao lado do arquivo. Os dois guias usam Inter em todos os estilos, inclusive `code-inline`. Usar `--stitch-font-family` e, para cada estilo, `--stitch-type-<estilo>-{size,line,weight,tracking}`. Tamanho e entrelinha abaixo estão em px com raiz de 16 px, o tracking está em em. Aplicar texto em caixa alta no componente quando a referência usar `uppercase`.

| Estilo | Claro · tamanho / linha / peso / tracking | Escuro · tamanho / linha / peso / tracking |
| --- | --- | --- |
| `display-hero` | 56 / 64 / 700 / −0,035 | 64 / 72 / 700 / −0,04 |
| `display-hero-mobile` | 32 / 40 / 700 / −0,025 | 36 / 44 / 700 / −0,03 |
| `headline-lg` | 32 / 40 / 700 / −0,025 | 32 / 40 / 700 / −0,025 |
| `headline-lg-mobile` | 24 / 32 / 700 / −0,02 | 24 / 32 / 700 / −0,02 |
| `headline-md` | 22 / 28 / 600 / −0,02 | 24 / 32 / 600 / −0,02 |
| `headline-sm` | 18 / 24 / 600 / −0,015 | 18 / 26 / 600 / −0,01 |
| `body-lg` | 16 / 24 / 400 / −0,005 | 16 / 26 / 400 / −0,005 |
| `body-md` | 14 / 20 / 400 / 0 | 14 / 22 / 400 / 0 |
| `body-sm` | 12 / 18 / 400 / 0,005 | 12 / 18 / 400 / 0,01 |
| `label-uppercase` | 11 / 16 / 600 / 0,22 | 11 / 16 / 600 / 0,22 |
| `label-md` | 13 / 18 / 500 / 0 | 13 / 18 / 500 / 0 |
| `code-inline` | 12 / 16 / 500 / 0 | 12 / 16 / 500 / 0 |

Os guias listam `display-hero` e `headline-lg-mobile` sem ocorrências das respectivas classes de tamanho nos 28 HTMLs. O `display-hero-mobile` escuro aparece em métricas do Dashboard e do Ranking. O catálogo usa `headline-lg` com `leading-tight` no título do destaque. O player usa `headline-md` com `tracking-tight` no título da aula, com peso 700 no claro e 600 no escuro. Descrições com `leading-relaxed` e micro-rótulos com `tracking-wider` ou `tracking-widest` têm modificadores próprios. A correspondência é pelo valor computado e pelo papel do texto.

As referências usam Material Symbols Outlined de 16, 18, 20, 22 e 24 px. `--stitch-icon-font-family` identifica a fonte das referências. O CSS de tokens não carrega arquivos de ícone. Disponibilidade local, licença e compatibilidade de renderização entram na validação de cada consumidor. Preservar os ativos originais e a proporção da marca oficial. Nas recapturas, as exceções aprovadas são o SVG oficial do pacote 3 para a URL indisponível da marca e o avatar com iniciais do usuário na discussão do fórum.

## Cores por função

| Função no CSS, após `--stitch-` | Claro | Escuro |
| --- | --- | --- |
| `canvas`, `canvas-player`, `canvas-catalog` | `#FFF`, `#F8F9FA`, `#FAFAFA` | `#131313` |
| `canvas-admin-deep` | `#FFF` | `#0E0E0E` em Feedback, Equipe e White label |
| `surface-card`, `surface-panel`, `surface-raised` | `#FFF` | `#1F1F1F`, `#201F1F`, `#1F1F1F` |
| `surface-control`, `surface-control-catalog` | `#F4F4F5`, `#F4F4F5` a 90% | `#1C1B1B` |
| `surface-input`, `surface-hover` | `#FFF`, `#F4F4F5` | `#161616`, `#2A2A2A` |
| `surface-raised-strong`, `surface-bright` | `#F4F4F5`, `#E4E4E7` | `#353534`, `#393939` |
| `surface-selection`, `surface-selection-admin` | `#000` | `#201F1F`, `#1F1F1F` |
| `surface-selection-catalog` | `#18181B` | `#201F1F` |
| `text-on-selection`, `text-on-selection-thread` | `#FFF` | `#E5E2E1`, `#FFF` |
| `surface-segment`, `surface-segment-active` | `#F4F4F5`, `#FFF` | `#1C1B1B`, `#201F1F` |
| `surface-inverse`, `text-inverse`, `text-inverse-muted` | `#09090B`, `#FFF`, `#A1A1AA` | `#000`, `#FFF`, `#8A8A8A` |
| `border-subtle`, `border-muted`, `border-strong` | `#E4E4E7`, `#E5E7EB`, `#D4D4D8` | `#353534`, `#333`, `#4C4546` |
| `border-control`, `border-control-thread`, `border-translucent` | `#E4E4E7`, `#E4E4E7`, preto a 8% | `#2E2E2E`, `#353534` a 50%, branco a 8% |
| `text-primary`, `text-heading`, `text-body` | `#09090B`, `#09090B`, `#18181B` | `#E5E2E1`, `#FFF`, `#E5E2E1` |
| `text-secondary`, `text-muted`, `text-subdued` | `#52525B`, `#71717A`, `#71717A` | `#CFC4C5`, `#8A8A8A`, `#555` |
| `action`, `on-action`, `action-hover`, `action-hover-soft`, `focus` | `#09090B`, `#FFF`, `#27272A`, `#27272A`, `#09090B` | `#FFF`, `#000`, `#E2E2E2`, `#E5E2E1`, `#FFF` |
| `error`, `on-error`, `error-surface`, `on-error-surface` | `#BA1A1A`, `#FFF`, `#FFDAD6`, `#93000A` | `#FFB4AB`, `#690005`, `#93000A`, `#FFDAD6` |
| `status-success`, `status-success-surface` | `#065F46`, `#ECFDF5` | `#34D399`, `#10B981` a 10% |
| `progress-track`, `progress-fill` | `#E4E4E7`, `#09090B` | `#1F1F1F`, `#FFF` |

O player e o catálogo claros aplicam fundos diferentes diretamente no HTML. No escuro, `#131313` e `#E5E2E1` vêm de `bg-background` e `text-on-surface`. Títulos em `text-pure-white` usam a variante branca, e a cor de seleção muda entre o menu de membros e administração. A superfície `#161616` e o contorno `#2E2E2E` vêm do guia escuro para campos. As buscas do HTML usam o fundo `#1C1B1B` no escuro e as variantes `#F4F4F5` no claro. O estado hover das ações aparece como `zinc-800` no claro, `primary-fixed` no player escuro e `secondary-fixed` em Conta. As cores de sucesso vêm das classes esmeralda aplicadas em estados de conclusão, como etiquetas da aula clara e indicadores operacionais escuros. Tratar estados com rótulo ou texto. O contraste de `text-subdued` escuro é insuficiente para leitura pequena sobre o canvas. Divisórias, bordas, placeholders e ícones essenciais exigem validação no contexto do controle.

## Espaçamento, raios e molduras

- `space-xs/sm/md/lg/xl` medem 4, 8, 16, 24 e 40 px. `gutter` e `margin` medem 24 e 32 px. Tablet usa calha de 16 e margem de 24 px. Mobile usa calha de 12 e margem de 16 px. Os guias descrevem a grade desktop a partir de 1280 px, tablet a partir de 768 px e reflow abaixo de 768 px. Cada moldura define seu ponto de colapso pelo espaço necessário para navegar e usar os controles.
- `guide-content-max` mede 1240 px no claro e 1200 px no escuro. Os HTMLs usam limites por superfície. Os dois catálogos, Conta e Encontros usam `max-w-7xl` de 1280 px (`member-content-max`). Os dois players usam `max-w-[1520px]` (`player-content-max`). Materiais e Ranking escuros usam 1240 px.
- `radius-sm/base/md/lg/xl/full` medem 4, 8, 12, 16, 24 e 9999 px. `radius-6` cobre o `rounded-md` de 6 px do Tailwind nos HTMLs. Os nomes das classes variam por configuração. Nos players, `rounded-xl` mede 12 px e `rounded-2xl` mede 16 px.
- Alvos interativos de 44 × 44 px, texto de campos de 16 px e foco visível de 2 px com afastamento de 3 px são critérios da aplicação. Os guias listam controles de 40 px no claro, 44 px no escuro e ação ampla de 48 px no claro. O avatar mede 32 px. As medidas de 18 px para checkbox e 6 a 8 px para progresso descrevem a figura dentro do alvo.

| Uso | Token após `--stitch-` | Claro | Escuro |
| --- | --- | --- | --- |
| Lateral de membros / administração | `rail-member-width` / `rail-admin-width` | 256 / 288 px | 256 / 288 px |
| Fundo da lateral de membros e administração | `surface-member-rail` / `surface-admin-rail` | `#FFF` | `#0E0E0E` |
| Lateral da discussão | `surface-member-rail-thread` | `#FFF` | `#1C1B1B` com divisória `#353534` |
| Lateral de Feedback, Equipe e White label | `surface-admin-rail-deep` | `#FFF` | `#121212` |
| Altura comum do cabeçalho | `topbar-height` | 64 px | 64 px |
| Topo de membros / discussão | `surface-member-topbar` / `surface-member-topbar-thread` | Branco a 90% | `#0E0E0E` / `#131313`, ambos a 80% |
| Topo administrativo / de Pedidos e Tickets | `surface-admin-topbar` / `surface-admin-topbar-orders` | Branco a 90% | `#121212` a 90% / `#131313` a 85% |
| Desfoque do topo | `topbar-blur` | 12 px | 24 px |
| Contêiner de busca nas molduras | `topbar-search-max`, `topbar-search-thread-width`, `topbar-search-admin-width` | 448 px como limite no cabeçalho de membros | 448 px como limite em membros, 384 px na discussão e 320 px nas buscas de Feedback, Equipe e White label |

As molduras descrevem treze HTMLs de membros e doze administrativos. Os exemplos administrativos e o da discussão existem somente em escuro. As entradas claras correspondentes usam as superfícies do guia claro e a geometria do HTML escuro como base de migração. Checkout, onboarding e verificação usam composições independentes.

## Elevação

| Uso | Claro | Escuro |
| --- | --- | --- |
| `shadow-card` | 0 1px 3px, preto a 4% | Separação por tom e borda |
| `shadow-active` | 0 4px 16px −2px, preto a 6% | 0 4px 16px, preto a 30% |
| `shadow-dialog` | 0 20px 32px −8px, preto a 10% | 0 16px 40px, preto a 70% |
| `shadow-shell` | 0 1px 4px, preto a 2% | 0 1px 8px, preto a 4% |
| `shadow-shell-deep` | 0 1px 4px, preto a 2% | 0 1px 8px, preto a 50% |
| `overlay` | `#09090B` a 40% | Preto a 60% |

Elevação de card claro, elevação de diálogo e opacidade clara do overlay vêm do guia. A sombra ativa escura aparece em controles no catálogo, player e encontros. A moldura de discussão escura usa divisória em vez de sombra. A sombra profunda escura pertence às laterais e aos topos de Feedback, Equipe e White label.

## Aceite da implementação

Validar os consumidores com teclado, foco, estados de carregamento, vazio, erro e acesso, AJAX e preservação de entradas. Exercitar largura de 360 px e ambos os temas, com ajuda e tour compatíveis com a tela quando houver alteração de interface. O [plano de entrega](docs/audit/plano-entrega-stitch.md) orienta a revisão visual por rota. A meta aprovada é cerca de 90% de fidelidade ao layout, avaliada lado a lado pela composição, hierarquia e acabamento. Contagens de pixels servem ao diagnóstico. Registrar diferenças relevantes de conteúdo, ativos e requisitos como campos menores no protótipo ou marca escura com contraste insuficiente.
