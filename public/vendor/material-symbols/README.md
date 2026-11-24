# Material Symbols Outlined

## Controle do player

O controle **Avançar 10 segundos** usa `forward_10` (U+E056) da fonte local v2.985. O SVG anterior aparece durante o carregamento e permanece disponível se a fonte falhar. O botão conserva nome, foco, área de 44 × 44 px e a ação original.

### Origem e licença

- Os 28 `code.html` dos quatro pacotes (2, 8, 8 e 10 arquivos) tiveram SHA-256 conferido contra o manifesto v2. Todos carregam Material Symbols Outlined com `wght,FILL@100..700,0..1&display=swap`. São 37 links, contando duplicatas. Desses HTMLs, 27 também declaram `opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`. O thread de comunidade usa só a primeira declaração. Há 40 elementos com `FILL=1` explícito em 10 HTMLs.
- Nos dois HTMLs do player, a segunda declaração entrega o arquivo `v387` de 1.143.948 bytes, versão OpenType `2.985`. Seu SHA-256 coincide com o registrado nas recapturas anteriores. A fonte variável do repositório oficial no commit `10ecc14` tem versão interna `2.978`. O piloto usa a mesma versão do CDN que serviu os HTMLs. [CSS original efetivamente usado](https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap) · [Commit oficial](https://github.com/google/material-design-icons/commit/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7)
- O guia oficial do Google declara Apache-2.0 para Material Symbols e documenta auto-hospedagem e recorte por `icon_names`. A tabela `name` do arquivo atribui o copyright a Google LLC, 2026. O WOFF2 local é uma cópia byte a byte do subset gerado pelo Google Fonts. A licença integral acompanha o arquivo. [Guia oficial](https://developers.google.com/fonts/docs/material_symbols) · [Apache-2.0 no repositório oficial](https://github.com/google/material-design-icons/blob/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/LICENSE) · [Licença redistribuída](LICENSE-APACHE.txt)

| Artefato | Bytes | SHA-256 |
| --- | ---: | --- |
| [WOFF2 local](outlined-forward-10-add1efca.woff2) | 1.644 | `add1efcac1ceabe68355c1bfc5aa90f3be5d157d9241c522778ed09e9c686877` |
| WOFF2 de referência dos dois players | 1.143.948 | `1b68bf7291b1ae12548604ca39eba4a855d62ca9092c2bffc0ca955fe393563c` |
| [Licença original](LICENSE-APACHE.txt) | 11.357 | `58d1e17ffe5109a7ae296caafcadfdbe6a7d176f0bc4ab01e12a689b0499d8bd` |

O CSS de obtenção respondeu HTTP 200. O binário oficial do Google Fonts foi servido com `font/woff2`. Para conferir a cópia, baixe o binário em arquivo temporário e compare seu SHA-256 ao da tabela. A URL do CSS pode passar a servir uma versão futura. O nome do arquivo local inclui o prefixo do SHA. [CSS de obtenção](https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100..700,0..1,0&icon_names=forward_10&display=block) · [Binário oficial](https://fonts.gstatic.com/l/font?kit=kJEPBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oDMzBwG-RpA6RzaxHMPdY40KH8nGzv3fzfVJO1USv9luNqRWOiV6Mo-dRodta2_9ZNVk&skey=b8dc2088854b122f&v=v387)

### Eixos e equivalência

| Eixo | Intervalo declarado no HTML quando presente | Variante efetivamente carregada nos players | Piloto `forward_10` |
| --- | --- | --- | --- |
| `opsz` | 20–48 | Fixo em 24 na versão `Material Symbols Outlined 24pt` | 24, fixo no arquivo |
| `wght` | 100–700 | Variável, padrão 400 | 400, explícito no CSS |
| `FILL` | 0–1 | Variável, padrão 0 | 0, explícito no CSS |
| `GRAD` | −50–200 | Fixo em 0 | 0, fixo no arquivo |

Nos players claro e escuro, `forward_10` tem tamanho e entrelinha de 20 px, peso computado 400 e `font-variation-settings: normal`, que resolve para os padrões do arquivo. O `play_arrow` central usa `FILL=1`, 36 px a 360 px e 44 px a 1280 px. O `play_arrow` da barra usa 24 px e preenchimento padrão. A inspeção com FontTools 4.62.1 confirmou a versão, os dois eixos variáveis restantes e a igualdade dos 40 comandos de contorno, do avanço (960) e da margem esquerda (120), em unidades da fonte, para U+E056. O CSS inclui o espaço na faixa Unicode para aplicar as métricas de linha da fonte e manter a posição do glifo.

No ensaio de glifo, renderizamos os dois HTMLs originais intactos com as folhas e a fonte capturadas do Google e os scripts Tailwind do export. O teste obteve os estilos computados do Stitch e trocou somente o glifo dentro do botão da fixture pela ligatura de referência, mantendo a mesma posição, caixa, fundo e cor. A medição RGBA considerou os 1.936 pixels do botão, com DPR 1 e tolerância zero.

### Evidências e limites

- **Renderização.** Zero pixels RGBA divergentes nos oito casos (Chrome 158.0.8127.37 e WebKit 26.0, 360 e 1280 px, claro e escuro). Em relação ao SVG anterior, o glifo Stitch altera de 174 a 178 pixels. Com HTTP 404 forçado no WOFF2, o SVG coincide pixel a pixel com a versão anterior nos oito casos.
- **Comportamento.** A fixture confirmou uma requisição de fonte na própria origem, MIME e SHA corretos, zero requisições externas, alvo de 44 × 44 px, nome acessível, foco por teclado e avanço real de 10 segundos na mídia sintética. `npm test -- src/lesson-video-controls.test.tsx src/lesson-stitch.test.tsx` passou com 16 testes no total. `npm run typecheck` passou.
- **Peso.** Na compilação Vite isolada do mesmo player antes e depois, o JS aumentou 388 bytes brutos (143 gzip) e o CSS, 653 bytes brutos (264 gzip). O WOFF2 de 1.644 bytes é carregado sob demanda. Isso soma 2.051 bytes de payload adicional com gzip no JS e CSS.

A prova do piloto cobre um glifo e uma ação do player com mídia sintética.

## Moldura mobile de Catálogo, Fórum e Player

Os seis HTMLs dedicados a 360 px carregaram o WOFF2 `v387` de 1.143.948 bytes da tabela acima. Os três claros também declaram o intervalo de quatro eixos e os três escuros também declaram uma variante fixa. Nos seis, a declaração posterior de peso e preenchimento serviu a fonte usada no cabeçalho e na barra. A inspeção confirmou versão interna 2.985, tamanho óptico 24, peso 400, preenchimento 0 e grade 0 para os glifos adotados.

O segundo subconjunto é uma cópia byte a byte do WOFF2 oficial entregue pelo Google Fonts com os quatro eixos fixos nesses valores. FontTools 4.62.1 confirmou a igualdade dos contornos, avanços e margens esquerdas dos 12 glifos com a fonte servida aos originais. O Chrome confirmou zero diferença RGBA em 28 comparações dos glifos adotados, com posição, caixa, cor e tamanho iguais aos respectivos estados. A aplicação serve a fonte na própria origem quando a moldura é exibida até 639 px. Os controles usam o SVG Lucide durante o carregamento e em caso de falha.

| Artefato | Bytes | SHA-256 |
| --- | ---: | --- |
| [WOFF2 da moldura](outlined-mobile-023b40ef.woff2) | 3.088 | `023b40ef6d7faab043709f4ff70fd06789f78415cdc60f36576c7a4812ae76a3` |

O recorte contém `arrow_back`, `bookmarks`, `emoji_events`, `forum`, `groups`, `leaderboard`, `menu`, `notifications`, `person`, `play_circle`, `podcasts` e `school`. O CSS de obtenção usa `icon_names` em ordem alfabética e responde com a URL do WOFF2 para um agente Chrome moderno. O arquivo conserva o copyright de Google LLC, 2026, e acompanha a licença Apache-2.0 original do diretório. [CSS de obtenção](https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=arrow_back,bookmarks,emoji_events,forum,groups,leaderboard,menu,notifications,person,play_circle,podcasts,school&display=block) · [Binário oficial](https://fonts.gstatic.com/l/font?kit=kJF1BvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oDMzByHX9rA6RzaxHMPdY43zj-jCxv3fzvRNU22ZXGJpEpjC_1v-p_4MrImHCIJIZrDCvHOejbd5zrDAt681H_tae-8u3BeQxazhdHcv0SCTu1bpt04QO_KpKaPZNsWd345zGHD08qPLkjCEVJSvoFE23&skey=b8dc2088854b122f&v=v387) · [Licença redistribuída](LICENSE-APACHE.txt)
