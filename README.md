# Icarus · Área de Membros

```text
 ___
|_ _|  ___ __ _ _ __ _   _ ___
 | |  / __/ _` | '__| | | / __|
 | | | (_| (_| | |  | |_| \__ \
|___| \___\__,_|_|   \__,_|___/
```

[![License: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
![Version](https://img.shields.io/badge/version-0.1.0-black)
![Stack](https://img.shields.io/badge/React%20%2B%20TypeScript-Supabase-black)

**Português brasileiro** · [English](#english)

Uma plataforma de cursos para uma academia, com materiais privados, certificados, suporte e comunidade com moderação humana. Interface com o **Design System Icarus**, Inter auto-hospedada, tema claro inicial e preferência escura por usuário.

Aplicação nova em React, TypeScript, Vite e Supabase. A árvore desta versão foi criada do zero; não usa Frappe nem depende da instalação anterior. O histórico Git continua preservado.

## Incluído

- Acesso, confirmação de email, primeira senha por convite, recuperação, onboarding, perfil e autenticação de dois fatores. Equipe exige MFA; membro que ativa MFA também deve concluir o desafio.
- Cursos, módulos, seções, aulas de texto/vídeo/áudio, prévias, restrições por plano, retomada e conclusão autorizada no servidor.
- Arquivos privados, uploads controlados, certificados com retrato da emissão, verificação pública por código e exportação PDF/PNG.
- Comunidade com espaços, publicações, respostas, votos, denúncias e aprovação manual de publicações e edições.
- Tickets com conversa e anexos privados; administração de conteúdo, membros, planos, pedidos e documentos legais.
- Checkout hospedado Asaas preparado para Sandbox e mídia Bunny configurável. Dados de cartão não passam pela aplicação.
- Ajuda pública e guias dos fluxos, sem conceder acesso ou progresso acadêmico.

Papéis de equipe e direitos de assinatura são independentes. O servidor valida identidade, sessão, plano, titularidade e estado atual de cada recurso.

## Começar localmente

Pré-requisitos: Node.js 24+, npm, Docker, Supabase CLI e Deno 2; `ffmpeg` para o vídeo sintético de demonstração.

```sh
git clone --depth 1 https://github.com/tiberiolemes/icarus-area-de-membros.git
cd icarus-area-de-membros
npm ci
npm run local:start
node scripts/bootstrap.mjs --demo
npm run dev
```

Abra **http://127.0.0.1:8088**. Os acessos sintéticos são gerados em `.local/ACESSOS.md`, com permissão privada. Não há senha pública padrão. A demonstração é rotulada e não habilita venda ou cadastro com documentos jurídicos fictícios.

API, banco e caixa de email local usam `58521`, `58522` e `58524`. Os scripts operam apenas `icarus-courses-local`, verificam loopback e preservam volumes de outros projetos.

```sh
npm run local:status
npm run local:stop
```

Leia [operação e instalação](docs/operations.md) para a sequência completa, primeiro administrador, Edge Functions, backup e configuração de uma cópia própria. O servidor frontend precisa de fallback de rotas para `index.html`.

## Configuração e segurança

`.env.example` contém somente URL e chave pública do Supabase. Chave `service_role`, Asaas e Bunny pertencem ao ambiente **servidor** das Edge Functions. Nunca os coloque em variáveis `VITE_*`, no Git ou no navegador.

Antes de abrir uma instalação ao público, configure Supabase, HTTPS, URLs de retorno, SMTP, MFA, backup, oferta e textos jurídicos aprovados. Homologue Asaas Sandbox e Bunny nessa instalação. Esta entrega não cria infraestrutura cloud nem atesta operação externa. Cobrança em produção permanece bloqueada até homologação correspondente.

Consulte [contrato](docs/CONTRACT.md), [API](docs/api.md), [integrações](docs/acceptance/integrations.md) e [escopo](docs/ROADMAP.md). URLs privadas já emitidas podem continuar válidas até seu curto prazo de expiração.

## Verificações

```sh
npm run typecheck
npm test
npm run build
node scripts/test-integrations.mjs
npm run test:db
node scripts/test-integrations.mjs --local
```

Banco e integrações nativas exigem instalação local e fixtures próprias. Transporte simulado é identificado separadamente das provas reais de Auth, Postgres, Storage e Mailpit. O [aceite técnico 0.1.0](docs/acceptance/release-0.1.0.md) reúne as provas e limitações. Os [relatórios](docs/acceptance) não representam capacidade pública ou disponibilidade mensal.

O [pipeline de GitHub Actions](docs/ci/README.md) está preparado para ativação pelo proprietário. Ele ainda não está ativo: a credencial de publicação não inclui a permissão `workflow`. Os testes locais e os resultados de Actions são evidências distintas.

## Limites

Escopo: Fase 1 mais comunidade manual. Ranking, mensagens diretas, podcasts, encontros, automações, IA, quizzes e multi-tenant ficam fora desta versão. Integrações externas, emissão fiscal, SMTP externo, testes com pessoas e instalação no servidor são etapas posteriores com configuração do responsável.

## Licença e colaboração

[MIT](LICENSE). Fontes, ícones, SDKs e código de terceiros mantêm suas licenças: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). A licença do código não concede direitos sobre marcas ou conteúdo carregado por operadores e alunos.

Veja [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) e [CHANGELOG.md](CHANGELOG.md).

## English

Icarus is a single-academy course delivery app with private learning materials, certificates, support tickets and a manually moderated community. It uses React, TypeScript, Vite and Supabase, with the official Icarus Design System, self-hosted Inter and per-user light/dark preferences.

This release is a fresh implementation; it does not use Frappe. Git history is preserved. Staff roles and subscription entitlements are separate. Server-side authorization is required for every protected operation.

Requirements: Node.js 24+, npm, Docker, Supabase CLI and Deno 2; `ffmpeg` for the optional local demo video. Run the commands above and open `http://127.0.0.1:8088`. Generated demo credentials remain in the private, ignored `.local/ACESSOS.md` file. There is no shared default password.

Read [operations](docs/operations.md) and [API documentation](docs/api.md) before installation. Configure server secrets, HTTPS, redirects, email, MFA, backups and approved legal content before opening registration. Never expose a service-role or provider secret through a `VITE_*` variable.

Asaas checkout is prepared for Sandbox acceptance; production billing remains disabled. Bunny, external email, tax documents and hosted deployment have not been certified by local tests. No real payment is made by the test suite. Future phases, AI and multi-tenancy are outside this release.

Original application code is MIT licensed. Third-party assets retain their licenses. Contributions must preserve authorization, privacy, accessibility, local verification and the Icarus visual system.

The [GitHub Actions pipeline](docs/ci/README.md) is supplied as an activation template. It is not active because the publication credential lacks the `workflow` scope. Local test results are not presented as a successful Actions run.
