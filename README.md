<pre>
+----------------------------------------------------------+
|                         ICARUS                           |
|                     ÁREA DE MEMBROS                      |
+----------------------------------------------------------+
</pre>

# Icarus Área de Membros

[![Fonte r23](https://img.shields.io/badge/fonte-r23-111111)](CHANGELOG.md)
[![Projeto MIT](https://img.shields.io/badge/projeto-MIT-333333)](LICENSE)
[![Base LMS AGPL](https://img.shields.io/badge/base_LMS-AGPL--3.0--or--later-555555)](license.txt)

**Português brasileiro · [English](#english)**

Área de membros com cursos, capítulos, aulas, turmas, progresso e comunidade anual com moderação manual. Usa Vue 3, frappe-ui e Frappe Framework, com o [Design System Icarus](https://tiberiolemes.com.br/icarus/ds/) e localização PT-BR.

Fonte da versão **r23**, integrada e revisada localmente. [Changelog](CHANGELOG.md) · [Proveniência e validação](docs/releases/r23.md) · [Licenças](NOTICE.md).

## Recursos e escopo

- Editor de cursos/aulas, avaliações e arquivos privados.
- Arquivo/restauração de cursos, capítulos e aulas com histórico preservado.
- Comunidade anual independente, concessões administrativas e aprovação manual.
- Discussões paginadas, contagens agregadas e disponibilidade de categoria ao digitar.
- Sessões, senhas, 2FA, privacidade, ajuda pública e tours contextuais.
- Indicadores, períodos e exportação CSV/XLSX/PDF/PNG nos recortes documentados.

Homologação humana e conteúdo jurídico do responsável continuam pendentes. Cadastro público permanece bloqueado com política em rascunho. Checkout está adiado e moderação é manual. Integrações externas, capacidade pública e dispositivo físico não compõem o aceite local.

## Reproduzir o ambiente local

Requisitos: Git, Python 3, Docker com Compose >= 2.30 e recursos para compilar o framework e suas SPAs. A homologação usou VM com aproximadamente 8 GiB RAM. A receita usa amd64; ARM exige emulação. Dependências e digests são fixados.

    git clone https://github.com/tiberiolemes/icarus-area-de-membros.git
    cd icarus-area-de-membros
    python3 local/prepare.py
    docker build --platform linux/amd64 -f local/Dockerfile -t icarus-local:r23 .
    TIBERIO_LOCAL_IMAGE=icarus-local:r23 python3 local/manage.py start
    TIBERIO_LOCAL_IMAGE=icarus-local:r23 python3 local/manage.py status

Abra http://tiberio.localhost:8088/lms. O launcher gera credenciais exclusivas em .local/ACESSOS.md, permissão 0600. A pasta .local é ignorada pelo Git. Não existe senha compartilhada neste repositório.

A receita reproduz o site de avaliação tiberio.localhost, com a personalização e os exemplos sintéticos identificados. lms/tiberio_i18n.py delimita essa personalização. Hospedagem pública exige configuração própria de domínio, TLS, e-mail, marca e políticas. Não há imagem r23 publicada em registry.

Para parar preservando os volumes:

    TIBERIO_LOCAL_IMAGE=icarus-local:r23 python3 local/manage.py stop

Proteja banco, arquivos e configuração e comprove restauração antes de migrar. Nunca remova volumes para atualizar. Retornar uma imagem não desfaz schema.

## Fonte e validação

Base: Frappe LMS 16.4.0, commit 3375b24109b8a8cf64f71c3ebc4870605d1cac89, Framework 16.60.2 e Payments fixados na receita. Identificadores técnicos lms foram preservados.

O build local r23 passou **2.656 testes frontend**, com gates e provas afetadas no [registro da versão](docs/releases/r23.md). Isso não equivale a CI neste GitHub, suíte global do framework verde ou aceite universal de estados visuais.

Workflows upstream estão preservados em .github/upstream-workflows como referência. Eles dependem de serviços, branches e permissões do projeto original. Este envio não configura jobs automáticos. Consulte [CONTRIBUTING.md](CONTRIBUTING.md) antes de adaptar CI.

## Licenças

O [LICENSE MIT](LICENSE) já existente foi preservado. Código herdado do LMS conserva [license.txt AGPL](license.txt), avisos e metadados. MIT não substitui os termos dos componentes herdados. Consulte [NOTICE.md](NOTICE.md) e cada dependência.

---

## English

**Icarus Members Area** provides courses, chapters, lessons, batches, progress and an independent annual community with manual moderation. It uses Vue 3, frappe-ui and Frappe Framework, with the [Icarus design system](https://tiberiolemes.com.br/icarus/ds/) and Brazilian Portuguese localization.

This is the source of locally integrated and independently reviewed **r23**. See the [changelog](CHANGELOG.md), [validation record](docs/releases/r23.md) and [notices](NOTICE.md).

### Features and boundaries

Course/lesson editing, assessments, private files, reversible archiving, annual administrative grants, manual approval, bounded discussions, category availability checks, sessions, passwords, 2FA, privacy controls, help/tours, metrics and filtered exports are included within documented scopes.

Human acceptance and owner legal content remain pending. Public registration stays blocked with draft policies. Checkout is deferred; moderation is manual. External integrations, public capacity and physical devices are outside local acceptance.

### Local setup

Run the same commands above. Requirements are Git, Python 3, Docker with Compose >= 2.30 and resources to compile the framework/SPAs. The tested VM had approximately 8 GiB RAM. The pinned recipe uses amd64; ARM requires emulation.

Open http://tiberio.localhost:8088/lms. The launcher generates unique credentials in Git-ignored .local/ACESSOS.md, mode 0600. No shared password is distributed.

The recipe reproduces the named evaluation site, customization and synthetic examples. lms/tiberio_i18n.py scopes the customization. Public hosting needs its own domain, TLS, email, branding and policies. No r23 registry image is published.

The stop command preserves volumes. Back up database, files and configuration and prove restoration before migrations. Image rollback alone does not reverse schema.

### Validation, contribution and licensing

Based on LMS 16.4.0, commit 3375b24109b8a8cf64f71c3ebc4870605d1cac89, with pinned Framework 16.60.2 and Payments. Technical lms identifiers remain unchanged.

The local r23 build passed **2,656 frontend tests**, with scoped gates and affected evidence in the release record. This is not remote GitHub CI, a globally green framework suite or exhaustive visual acceptance.

Original workflows are archived in .github/upstream-workflows for reference; they rely on upstream infrastructure and permissions. This upload configures no automatic jobs. Read [CONTRIBUTING.md](CONTRIBUTING.md) before adapting CI.

The existing MIT LICENSE is preserved. Inherited LMS code retains its AGPL license.txt, notices and metadata. MIT does not replace inherited component terms. See [NOTICE.md](NOTICE.md) and dependency licenses.
