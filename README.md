# Icarus · Área de Membros

![Icarus · Área de membros e cursos online · Código aberto sob licença MIT](docs/assets/icarus-banner-github.png)

[![License: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
![Version](https://img.shields.io/badge/version-2.2.3-black)
![Stack](https://img.shields.io/badge/React%20%2B%20TypeScript-Supabase-black)

**Português brasileiro** · [English](#english)

O Icarus é uma plataforma de código aberto para empresas e infoprodutores criarem sua área de membros e entregarem cursos online. Reúne materiais privados, certificados, suporte por chamados e comunidade com moderação humana. A interface segue o **Design System Icarus**, com Inter auto-hospedada, tema claro inicial e preferência escura por usuário.

Aplicação nova em React, TypeScript, Vite e Supabase. A árvore desta versão foi criada do zero; não usa Frappe nem depende da instalação anterior. O histórico Git continua preservado.

## Incluído nesta árvore de código

- Acesso, confirmação de email, primeira senha por convite, recuperação, onboarding, perfil e autenticação de dois fatores. MFA é opcional e recomendado para administradores. A ativação fica em Sua conta → Segurança. Depois de ativar, o código é solicitado no mesmo formulário AJAX do login.
- Cursos, módulos, seções, aulas de texto/vídeo/áudio, prévias, restrições por plano, retomada e conclusão autorizada no servidor.
- Arquivos privados, uploads controlados, certificados com retrato da emissão, verificação pública por código e exportação PDF/PNG.
- Comunidade com espaços, publicações, respostas, votos, denúncias e aprovação manual de publicações e edições.
- Busca de cursos, módulos e aulas pelo acesso do membro. Aulas com apresentação editorial, favoritos, notas privadas, checklist e comentários moderados.
- Notificações no aplicativo e anúncios de cursos e módulos, com aviso para inscritos na publicação conforme permissões do membro.
- Tickets com conversa e anexos privados; administração de conteúdo, membros, planos, pedidos e documentos legais.
- Checkout hospedado Asaas preparado para Sandbox e mídia Bunny configurável. Dados de cartão não passam pela aplicação.
- Ajuda pública e guias dos fluxos, sem conceder acesso ou progresso acadêmico.

Papéis de equipe e direitos de assinatura são independentes. O servidor valida identidade, sessão, plano, titularidade e estado atual de cada recurso. Administradores aparecem com a badge dourada Admin no cartão da conta e na comunidade.

## Demonstração navegável

[Abra a demonstração pública](https://tiberiolemes.github.io/icarus-area-de-membros/). A demonstração usa as telas, rotas e estilos da aplicação, com dados fictícios e acessos de aluno e administrador. Progresso e alterações ficam na sessão do navegador. Ela roda em hospedagem estática, sem banco, Supabase, configuração de chaves ou processamento de pagamentos.

```sh
npm ci
npm run build:demo
python3 -m http.server 8111 --bind 127.0.0.1 --directory demo-dist
```

Abra [a demonstração local](http://127.0.0.1:8111/). Para a página de vendas, sirva todo o diretório `demo-dist/` por HTTPS. O GitHub Pages compila e publica a demonstração quando mudanças relevantes entram na `main`. O arquivo `revisao.txt` identifica o commit servido. Ajuste as fixtures em [demo/](demo/) no mesmo PR se o contrato de um fluxo demonstrado mudar.

## Começar localmente

Para instalar uma versão publicada, extraia o código-fonte da tag correspondente ou abra um checkout dessa tag. O `package.json` está marcado como privado e o procedimento usa o `package-lock.json` do repositório. [Versões publicadas no GitHub](https://github.com/tiberiolemes/icarus-area-de-membros/releases).

Use Node.js 24+, npm e Supabase CLI `2.109.1`. Antes de rodar `local:start`, declare o [Docker dedicado e vazio](docs/operations.md#requisitos-do-docker-dedicado). Use Deno 2 para testes de contratos Edge, Python 3 para a suíte SQL e `ffmpeg` com `libx264` para a demonstração opcional. Execute na raiz do código-fonte.

```sh
npm ci
npm run local:start
npm run dev
```

Abra **http://127.0.0.1:8088**. Para configurar uma nova instalação, siga o fluxo de primeiro administrador no [guia de operação](docs/operations.md#primeiro-administrador-sem-conteúdo-demo). Para experimentar com dados sintéticos, execute `node scripts/bootstrap.mjs --demo` após `local:start`. O script gera senhas aleatórias em `.local/ACESSOS.md`, com permissão privada. A demonstração é rotulada e não habilita venda ou cadastro com documentos jurídicos fictícios.

API, banco e caixa de email local usam `58521`, `58522` e `58524`. Reserve essas portas e `8088` na máquina de teste. As partidas e paradas seguintes usam os IDs Docker registrados neste checkout.

```sh
npm run local:status
npm run local:stop
```

Para uma instalação v0.2.0 ou v0.1.6 existente, veja [Atualizar de versão](docs/operations.md#atualizar-de-versão) e siga o roteiro de atualização do [Docker local completo](docs/operations.md#atualizar-uma-instalação-docker-completa) ou do [Supabase hospedado](docs/operations.md#aplicar-migrações-no-supabase-hospedado). Os dois roteiros conferem o histórico e exigem backup antes da aplicação. Para configurar uma cópia hospedada vazia, configure [a instalação](docs/operations.md#instalação-hospedada-e-recursos-comerciais) e [o primeiro administrador](docs/operations.md#primeiro-administrador-hospedado). O servidor frontend precisa de fallback de rotas para `index.html`.

## Configuração e segurança

`local:start` gera `.env.local` conforme as variáveis de `.env.example`. Para um build que se conecte a uma instalação própria, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave pública do projeto antes de `npm run build`. Guarde `service_role`, Asaas e Bunny exclusivamente no ambiente **servidor**. O painel avisa os admins quando sai uma versão nova: o navegador deles consulta as Releases públicas do GitHub uma vez por dia. `VITE_ICARUS_UPDATE_REPO` troca o repositório consultado, e vazia desliga o aviso ([detalhes](docs/operations.md#atualizar-de-versão)).

Antes de abrir uma instalação ao público, configure Supabase, HTTPS, URLs de retorno, SMTP, MFA, backup, oferta e textos jurídicos aprovados. Homologue Asaas Sandbox e Bunny nessa instalação. Esta entrega não cria infraestrutura cloud nem atesta operação externa. Cobrança em produção permanece bloqueada até homologação correspondente.

Consulte o [mapa técnico e o dicionário de dados](docs/architecture.md), o [contrato](docs/CONTRACT.md), [API](docs/api.md), [integrações](docs/acceptance/integrations.md) e [escopo](docs/ROADMAP.md). URLs privadas já emitidas podem continuar válidas até seu curto prazo de expiração.

## Verificações

```sh
npm run typecheck
npm test
npm run build
node scripts/test-integrations.mjs
npm run test:db
node scripts/test-integrations.mjs --local
```

Banco e integrações nativas exigem instalação local e fixtures próprias. Para esta árvore, aplique todas as migrations em ordem e valide o stack nativo antes de liberar o uso. O ensaio de banco isolado e os requisitos por migration estão no [guia de operação](docs/operations.md). O [aceite técnico 0.1.0](docs/acceptance/release-0.1.0.md) e a [revisão visual 0.1.2](docs/audit/06-ux-accessibility.md) registram evidências de seus respectivos recortes.

O [modelo do GitHub Actions](docs/ci/README.md) descreve a automação. A execução da trilha nativa em Actions aguarda um runner com Docker dedicado.

## Limites

Encontros têm agenda, acervo e edição administrativa nesta árvore, com links de sala e gravação cadastrados pelo operador. Podcasts e masterclasses têm acervo, editor administrativo e marcação de assistido. O vídeo requer incorporação autorizada no YouTube. O Ranking tem classificação preliminar, sem configuração de prêmios. Mensagens diretas, IA, quizzes e multi-tenant seguem pendentes nesta árvore. Integrações externas, emissão fiscal, SMTP externo, testes com pessoas e instalação no servidor dependem da configuração e homologação do responsável.

## Licença e colaboração

[MIT](LICENSE). Fontes, ícones, SDKs e código de terceiros mantêm suas licenças: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). A licença do código não concede direitos sobre marcas ou conteúdo carregado por operadores e alunos.

Veja [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) e [CHANGELOG.md](CHANGELOG.md).

## English

Icarus is an open-source membership and online course delivery platform for businesses and digital course creators. It includes private learning materials, certificates, support tickets and a human-moderated community. It uses React, TypeScript, Vite and Supabase, with the official Icarus Design System, self-hosted Inter and per-user light/dark preferences.

This release is a fresh implementation; it does not use Frappe. Git history is preserved. Staff roles and subscription entitlements are separate; administrators carry a gold Admin badge on the account card and in the community. Server-side authorization is required for every protected operation.

[Try the public demo](https://tiberiolemes.github.io/icarus-area-de-membros/). Build the demo with `npm run build:demo` and serve the entire `demo-dist/` folder over HTTP on loopback or HTTPS on a static host. The demo uses the application’s routes, components and styles with fictional student and admin sessions and no backend. Update the [fixtures](demo/) when a demonstrated flow changes.

Use the source archive or checkout for the intended GitHub tag. The npm package is private. Use Node.js 24+, npm and Supabase CLI `2.109.1`. Before running `local:start`, declare the [dedicated, empty Docker daemon](docs/operations.md#requisitos-do-docker-dedicado). Contract tests use Deno 2, database tests use Python 3, and the optional demo uses `ffmpeg` with `libx264`. Run the commands above and open `http://127.0.0.1:8088`. The local checkout uses a fixed Docker project and ports. For a new installation, follow the first-admin instructions. The optional `node scripts/bootstrap.mjs --demo` writes randomly generated demo credentials to the private, ignored `.local/ACESSOS.md` file.

Apply all migrations for this source tree, then verify native Auth, Postgres, Storage, Edge Functions and local email. This tree includes course search, lesson notes, favorites, checklists, moderated comments, in-app notifications and catalog launch announcements. Members can browse podcasts, masterclasses and live events. Administrators manage the catalog and schedule. Podcast watch marks are included in the member data export.

Read [operations](docs/operations.md) and [API documentation](docs/api.md) before installation. The [architecture map](docs/architecture.md) links user flows to the [data dictionary](docs/data-dictionary.md). Admins see a notice when a newer GitHub Release exists: their browser asks the public GitHub API at most once a day, and an empty `VITE_ICARUS_UPDATE_REPO` turns it off. To upgrade an existing v0.2.0 or v0.1.6 installation, read [upgrading](docs/operations.md#atualizar-de-versão) and follow the [full local Docker](docs/operations.md#atualizar-uma-instalação-docker-completa) or [hosted Supabase](docs/operations.md#aplicar-migrações-no-supabase-hospedado) procedure. For a new hosted installation, follow the [first administrator procedure](docs/operations.md#primeiro-administrador-hospedado). Configure the Supabase URL and public key in the `VITE_*` variables before building. Keep service-role and provider secrets server-side. Configure HTTPS, redirect URLs, email, MFA support, backups and approved legal content before opening registration.

Asaas checkout is prepared for Sandbox acceptance; production billing remains disabled. Bunny, external email, tax documents and hosted deployment have not been certified by local tests. No real payment is made by the test suite. Future phases, AI and multi-tenancy are outside this release.

Original application code is MIT licensed. Third-party assets retain their licenses. Contributions must preserve authorization, privacy, accessibility, local verification and the Icarus visual system.

The [GitHub Actions template](docs/ci/README.md) documents the automation. The native job requires a runner with a dedicated Docker daemon.
