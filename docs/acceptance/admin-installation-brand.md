# Plataforma, marca e white label

## Comportamento e integração

`/admin/configuracoes?aba=marca` reutiliza a rota de Configurações, restrita ao administrador. O editor mostra o nome publicado, mantém um rascunho por usuário na sessão do navegador e oferece descarte. O formulário envia via AJAX, preserva o texto em falhas e dá foco ao erro. Quando outra sessão salva primeiro, o editor mostra o nome publicado e solicita novo envio explícito para substituí-lo. A prévia mostra o texto do rascunho e o SVG oficial em fundo claro e escuro.

| Requisito | Entrega e limites |
| --- | --- |
| RF-AD-26 | Nome de uma instalação, publicado nos contratos de leitura existentes. O SVG oficial Icarus e a preferência de tema por usuário seguem o Stitch. Logo personalizado, favicon, fundo, cores e outras opções visuais dependem de origem/tipo aceitos e de cobertura dos consumidores. Domínio, DNS e TLS pertencem à implantação. |
| RF-AD-27 | A navegação segue as seções da plataforma. Ligar, desligar e renomear módulos depende de um contrato que abranja navegação, rotas e acessos diretos. |
| RF-AD-29 | Atalho para a aba existente de Documentos legais. O editor usa `app_admin_list` e `app_admin_save` com `legal_versions`, uma versão publicada por tipo e imutabilidade do conteúdo após aceite. O fluxo vigente associa aceites à versão e distingue demonstração de documento válido para cadastro e checkout. Um novo salvamento invalida o contexto público no cliente. |

Antes da migration, `app_public_context().name` e `app_bootstrap().settings.name` devolviam `Icarus` fixo. O contexto público também entrega versões legais publicadas, planos ativos, disponibilidade legal do cadastro e perguntas ativas. O bootstrap autenticado inclui perfil, planos, pedidos próprios e, nas configurações, URLs relativas de Termos e Privacidade, onboarding, perguntas e capacidades sem credenciais. A migration 034 troca a fonte do nome nos dois contratos e preserva as demais chaves.

`app_admin_save_installation_name(p_name text, p_expected_revision integer) -> {name, revision, saved}` valida a sessão e o papel no servidor. O gate compartilhado exige AAL2 para conta com MFA verificado. A tabela singleton em `app_private` tem RLS e grants fechados. A RPC de escrita tem EXECUTE apenas para `authenticated` entre os papéis de API. A operação compara a revisão sob lock e incrementa a revisão inicial 0 em cada alteração efetiva, com uma auditoria `save` / `installation_brand`. Rascunho de uma revisão anterior recebe `saved: false` mesmo se o nome voltou ao texto inicial. Se o nome desejado já está publicado, o resultado tem `saved: true` sem incremento nem outra auditoria.

`app_bootstrap().settings` acrescenta `name_revision` inteiro e mantém `name` e os demais campos. `app_public_context()` continua expondo `name` com o payload existente. A coordenação pode usar `settings.name` no Shell autenticado e `app_public_context().name` no componente público, como texto, com fallback `Icarus`. O editor invalida e relê os dados com a sessão ativa. Só o formulário e a sessão que iniciaram o envio podem limpar ou rebasear seu rascunho. Um rascunho legado sem revisão ainda é restaurado e exige confirmação explícita para publicar um nome diferente. A âncora de tour é `[data-tour="admin-settings-brand"]`.

Navegador e banco removem espaços horizontais Unicode (`Zs`) das margens e medem até 80 pontos de código após a remoção. Nomes compostos apenas por espaços, caracteres Unicode ignoráveis ou Braille em branco são recusados. Controles e marcas de direção também são recusados. Emoji composto com ZWJ é aceito quando há conteúdo visível.

## Referência e verificação local

Foi inspecionado o HTML P2 `plataforma_marca_white_label` com SHA-256 `315f7be066c2b141fb0ed9d83c8643cfa2635c0280c93077d0a7122aa5c44dc7`. O manifesto v2 registra captura escura com viewport de 1280 × 1024, DPR 1 e documento de 1280 × 2646. O par de imagens tem zero pixels RGBA divergentes, com SHA-256 `feadefff11ab561ba6bd53a76f593f803474451280b0bacf09e4f0df048b2a0f`. A candidata deriva a faixa de domínio e a composição 7:5 de configuração e prévia. O conteúdo e a altura diferem porque a referência inclui controles sem contrato e dados ilustrativos. A paridade pixel a pixel integral segue aberta.

Navegador reproduzível em `tests/visual/admin-brand-app.mjs`, com sessão e transporte sintéticos em servidor efêmero próprio da worktree. No Chrome 158.0.8127.37, as quatro combinações de tema e viewport passaram em teclado, foco de 2 + 3 px, alvo de 44 px, campo de 16 px, largura sem transbordamento, erro, retomada de rascunho, descarte, reenvio, conflito e criação de versão legal de demonstração. Os cinco acessos negados incluem membro, instrutor, moderador, suporte e administrador com MFA verificado em AAL1.

| Tema | Viewport | Captura integral | Diferenças RGBA no par final |
| --- | --- | --- | --- |
| Claro | 1280 × 1024 | 1280 × 1024 | 0 |
| Claro | 360 × 880 | 360 × 1602 | 0 |
| Escuro | 1280 × 1024 | 1280 × 1024 | 0 |
| Escuro | 360 × 880 | 360 × 1646 | 0 |

O menor contraste de texto medido entre campo, aviso de domínio, botão principal e prévias foi 7,73:1. O contorno do campo passou 3:1 contra o painel nos dois temas. A repetição do par se refere à candidata local, cuja composição e estado diferem da referência P2.

## Verificação dos três P2

- No Chrome, adiei a resposta da primeira sessão A, troquei para B e retornei em outra sessão de A. A confirmação atrasada trazia revisão 1. A nova sessão releu a revisão 3 pelo bootstrap, sem aplicar a resposta antiga, e preservou o rascunho da revisão 2 após recarregar. Passaram também cinco entradas recusadas e três nomes normalizados e salvos, sem RPC para entrada inválida.
- No PostgreSQL isolado com UTF-8 e locale C, a suíte `supabase/tests/installation_brand.sql` confirmou U+034F e U+00A0 isolados, espaços marginais, 80/81 pontos de código, emoji composto, revisão, payload e permissões. Passaram 33 asserções da marca, 109 de backend, 17 de criação de conta e 25 de MFA opcional, com as migrations 001–032 e 034.
- Em duas conexões PostgreSQL com administradores e sessões distintos, a segunda aguardou o lock e recebeu conflito. Após as duas alterações do nome e o retorno a `Icarus` na revisão 2, a tentativa antiga recebeu conflito, a repetição do nome vigente foi idempotente e o readback autenticado e anônimo confirmou o estado. Foram duas auditorias para duas alterações efetivas.

O ensaio de regressão repetiu os quatro cenários Chrome e as cinco negativas de acesso. Nos pares finais, houve zero pixels divergentes a 1280 px e, a 360 px, 12 no claro e zero no escuro. A execução anterior variou 13 pixels no escuro a 360 px. Tipagem, build e os 222 testes do Vitest passaram. Os recibos locais estão em `.local/marca-p2/chrome-final/resultado.json` e `.local/marca-p2/duas-sessoes.json`.
