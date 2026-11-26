# Ajuda do Icarus

A Central de ajuda é servida em `/ajuda` para visitantes e em `/app/ajuda` para quem está com sessão. Ela reúne 45 artigos em 11 assuntos, com busca que ignora acentos. Não existe um segundo motor de artigos ou tours.

## Onde fica cada coisa

| Arquivo | Conteúdo |
| --- | --- |
| `src/pages/help-content.ts` | Tipos, lista de assuntos e montagem dos artigos |
| `src/pages/help-articles-member.ts` | Artigos do aluno |
| `src/pages/help-articles-team.ts` | Artigos da equipe |
| `src/pages/help-articles-integrations.ts` | Asaas, Bunny Stream e Cloudflare Turnstile, com imagens |
| `src/pages/help-images/` | Telas das plataformas, em WebP |
| `src/pages/help-paths.ts` | Mapa que leva cada tela ao seu artigo |
| `src/pages/help.tsx` | Página, busca, voto e renderização |

A página é carregada sob demanda, para o texto dos artigos não pesar no primeiro acesso de quem só assiste às aulas.

## Assuntos

| Assunto | Público | Artigos |
| --- | --- | --- |
| Primeiros passos | Alunos | `acesso`, `conhecer-a-plataforma`, `verificacao-em-duas-etapas` |
| Cursos e aulas | Alunos | `cursos`, `recursos-da-aula`, `materiais`, `certificados` |
| Comunidade e eventos | Alunos | `comunidade`, `ranking`, `encontros`, `podcasts` |
| Conta e assinatura | Alunos | `conta`, `notificacoes`, `assinatura`, `privacidade` |
| Ajuda e suporte | Alunos | `suporte`, `feedback` |
| Começar no painel | Equipe | `administracao`, `equipe-e-papeis`, `dashboard-e-analytics` |
| Cursos e conteúdo | Equipe | `criar-curso`, `video-da-aula`, `apresentacao-da-aula`, `certificado-do-curso`, `anuncio-de-lancamento`, `arquivar-conteudo`, `publicar-materiais`, `administracao-podcasts`, `administracao-encontros` |
| Membros e vendas | Equipe | `membros`, `planos`, `pedidos` |
| Moderação e atendimento | Equipe | `moderar-comunidade`, `comentarios-de-aula`, `atender-chamados`, `administracao-feedback` |
| Configurações da plataforma | Equipe | `marca-da-plataforma`, `modulos`, `perguntas-do-primeiro-acesso`, `documentos-legais`, `privacidade-e-auditoria` |
| Integrações | Equipe | `integracoes`, `integracao-asaas`, `integracao-bunny`, `integracao-turnstile` |

O endereço de um artigo é `/ajuda/` seguido do nome acima. Os nomes da versão anterior foram mantidos, então links antigos continuam abrindo.

## Quem vê o quê

- Visitantes e alunos veem os assuntos de alunos. Para o aluno, um artigo de equipe aberto pelo endereço aparece como não encontrado. Para quem está sem sessão, a página convida a entrar e volta ao mesmo artigo depois do login, sem mostrar o conteúdo.
- A equipe vê tudo, com os assuntos separados em Para alunos e Para a equipe.
- Um artigo com `module` some para o aluno quando o módulo está desligado. A equipe continua vendo os artigos do painel daquele módulo, porque o painel segue funcionando.
- Com a Central de ajuda desligada, o aluno vê Recurso indisponível e a equipe continua lendo.

## Escrever ou alterar um artigo

Cada artigo tem `slug`, `category`, `title`, `summary` e `sections`. Os campos opcionais são `module`, `need` (o bloco Antes de começar), `trouble` (pares de pergunta e resposta) e `related`.

Uma seção aceita `title`, `intro`, `image`, `steps` (caminho numerado), `list` (itens sem ordem), `note` (dica) e `warn` (atenção). Um passo é um texto, ou um objeto com `text`, `image` e `note`.

O texto aceita três marcações.

- `**rótulo**` para o nome de um botão, campo ou aba, escrito exatamente como na tela.
- `` `valor` `` para algo que a pessoa digita ou confere letra por letra.
- `[texto](/ajuda/artigo)` para outro artigo, ou `[texto](https://…)` para um site. O link para um artigo que o leitor não pode ver vira texto simples.

Padrão de escrita, conferido por `src/help-content.test.ts` quando possível. O comportamento da página (busca, visibilidade, redirecionamento e voto) fica em `src/help-page.test.tsx` e `src/modules.test.tsx`.

- Uma ação por passo, começando por um verbo.
- Frases curtas e diretas, sem travessão separando ideias.
- Título em formato de frase, sem ponto final.
- Dois pontos só antes de lista ou citação.
- Nada de promessa de prazo de suporte, e-mail entregue, cobrança confirmada ou provedor homologado. Os artigos descrevem o que a tela faz.

Ao mudar uma tela, atualize o artigo dela e o passo do guia que usa o seu `data-tour`. Se a tela for nova, inclua o caminho em `help-paths.ts`, para os links Ajuda da administração e Ajuda completa abrirem o artigo certo.

## Imagens das plataformas

As imagens mostram telas reais do Asaas, do Bunny Stream e da Cloudflare, capturadas em novembro de 2026.

- Chaves, e-mails, domínios, números de conta, nomes e métricas foram trocados por valores de exemplo na própria tela, antes da captura. Nenhuma imagem contém credencial real. Itens da conta que não fazem parte do passo, como um domínio já cadastrado, foram escondidos.
- Os números em rosa marcam onde clicar. O texto do passo cita o mesmo número entre parênteses. Quando a imagem é da seção, os números coincidem com os passos.
- Cada imagem tem `alt` descrevendo a tela e os números, `caption` curta e as dimensões reais, para a página não pular ao carregar.
- O formato é WebP com qualidade 90, entre 1.150 e 1.570 px de largura. O conjunto pesa 1,2 MB e só é baixado por quem abre o artigo.

As plataformas mudam de aparência. Ao recapturar, mantenha o mesmo nome de arquivo e atualize `width`, `height`, `alt` e o texto dos passos.

## Guia das telas e avaliação

`src/tour.tsx` é o único guia React. A pessoa inicia o guia da tela atual, o fundo escurece ao redor do elemento destacado e só aparecem alvos presentes, com próximo passo, pausa, pulo, conclusão e avaliação. O link Ajuda completa abre o artigo da tela.

Eventos do guia e o voto Este artigo ajudou usam `app_help_feedback`, com o ator validado no servidor. O voto é oferecido somente após login. Não há envio anônimo.
