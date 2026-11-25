# Changelog

## 2.3.0 · 2026-11-25

- Lembrar por 15 dias na tela do código de dois fatores. Com a caixa marcada, o navegador continua conectado, mesmo parado, até 15 dias depois do login, sem senha nem código. Sem a caixa, nada muda: a sessão termina após 2 horas sem uso (30 minutos para a equipe). Vale para todos os papéis, inclusive admin e equipe, com a caixa desmarcada por padrão. Não marque em computador compartilhado: até o fim dos 15 dias, quem abrir aquele navegador entra sem senha nem código. O limite fica no banco: a RPC `app_remember_session` só marca a sessão quando ela está em AAL2 e o Auth registrou o código dela há menos de 5 minutos, conta os 15 dias da criação da sessão e não os prolonga. O AAL2 continua exigido no SQL e nas Edge Functions, e Sair encerra a sessão em todos os aparelhos.
- Badge Admin dourada com coroa no cartão da conta, no menu do celular e nas publicações da comunidade. No cartão, ela ocupa o lugar do plano, porque o admin acessa todo o conteúdo sem plano. Membros com plano e sem plano continuam como antes.
- Atualização da 2.2.3: aplique a migration `202611250002` e gere o frontend da tag. Não há Edge Function nova. Faça backup e siga [Atualizar de versão](docs/operations.md#atualizar-de-versão).

## 2.2.3 · 2026-11-25

- Fundo contínuo na área de conteúdo. O catálogo pintava o cinza só num bloco de 1280 px com a altura do conteúdo, e sobravam faixas brancas ao lado e abaixo dele em telas largas ou com poucos cursos. No tema escuro, as faixas ficavam pretas, também em Materiais, Certificados e Encontros. Agora o `main` cobre toda a área até o fim da tela, e o conteúdo continua na mesma largura e posição. O roteiro `tests/visual/demo-app.mjs` confere o fundo em 1920, 1280 e 360 px nos dois temas.
- Atualização da 2.2.2: gere o frontend da tag. Não há migration nem Edge Function nova.

## 2.2.2 · 2026-11-25

- Checkout com limite de tentativas por minuto: 5 por IP (só pelo `cf-connecting-ip`, IPv6 pelo /64), 5 por conta e 3 por email, inclusive o da conta logada. Trocar a `attempt_key` não abre mais pedidos e sessões no Asaas sem parar. Acima do limite, a resposta é 429.
- Turnstile no checkout quando o segredo `TURNSTILE_SECRET_KEY` estiver nos secrets das Edge Functions. O token é conferido no servidor antes do pedido e do Asaas. Sem resposta da Cloudflare, ou sem o script no navegador, a compra fica bloqueada com aviso para recarregar.
- A confirmação de senha da `reauthenticate` aceita 5 tentativas por minuto por usuário.
- Fora do modo local, a falta de `APP_ORIGIN` faz as Edge Functions responderem 503 `CONFIGURATION_REQUIRED`, em vez de levar convites e CORS para `http://127.0.0.1:8088`.
- Aviso de versão nova: uma consulta que não chegou ao GitHub (sem rede, bloqueada ou interrompida por recarga) não fica mais guardada como falha por 24 horas.
- Atualização da 2.2.1: aplique a migration `202611250001`, publique as Edge Functions e gere o frontend da tag. Faça backup e siga [Atualizar de versão](docs/operations.md#atualizar-de-versão).

## 2.2.1 · 2026-11-25

- Foto de perfil salva pelo botão Salvar foto, com aviso de foto pendente e proteção ao sair da tela. Antes, escolher a foto só criava a prévia, e Salvar perfil não a enviava. A foto aceita só JPG ou PNG de até 500 KB, conferidos no navegador pelo conteúdo real do arquivo e na Edge `upload`, que recusa o resto com 422.
- Aviso "Versão X disponível" no painel, só para admins, com as notas da Release e o roteiro de atualização. O navegador do admin consulta as Releases públicas do GitHub no máximo uma vez por dia; `VITE_ICARUS_UPDATE_REPO` troca o repositório, e vazia desliga o aviso. O admin pode dispensar o aviso daquela versão.
- Turnstile nas telas de entrar, cadastrar, recuperar senha e reenviar confirmação quando `VITE_TURNSTILE_SITE_KEY` estiver definido; o token segue para o CAPTCHA do Supabase Auth, que o confere no servidor. A confirmação de senha da Edge `reauthenticate` usa a chave de serviço, que o CAPTCHA do Auth não exige.
- Vitrine de cursos com retomada da aula pelo cartão, calendário personalizado no Dashboard e no Ranking, guia que ilumina o elemento de cada passo e logo oficial no painel. Ajustes de contraste, hierarquia e leitura no celular.
- Demonstração pública com as próprias telas do Icarus e dados fictícios, publicada no GitHub Pages.
- Atualização da 0.2.0: aplique as migrations `202611230039` e `202611230040`, publique as Edge Functions e gere o frontend da tag. O banco existente segue com os mesmos nomes de tabelas, sem recriar nada. Faça backup e siga [Atualizar de versão](docs/operations.md#atualizar-de-versão). Revisões não lançadas do `main` que usavam tabelas com prefixo `ica_` não seguem este caminho.

## 0.2.0 · Entrega 01

- Interface baseada no Stitch com componentes compartilhados, temas claro e escuro e navegação mobile em Catálogo, Fórum e Player.
- Busca autorizada, anúncios de lançamento, retomada, favoritos, notas privadas, comentários moderados e checklist de aulas. Materiais e certificados continuam protegidos pelo servidor.
- Encontros, Podcasts, Ranking preliminar, notificações internas e feedback com anexo privado. Ranking sem premiação configurada.
- Administração de conteúdo, pedidos, suporte, Marca, Dashboard e Analytics. Segundo fator opcional e recomendado para admins.
- Aulas de mesmo slug em seções diferentes têm endereços próprios por ID. O checkout visitante conserva o acesso temporário ao pedido no retorno ao mesmo navegador.
- Upgrade da versão 0.1.6 com migrations 021–038. Faça backup e siga o [guia de operação](docs/operations.md). Asaas em Sandbox, Bunny e SMTP externo dependem da configuração e da homologação de cada instalação.

## 0.1.6 · 2026-11-23

- Autor pode arquivar e restaurar sua publicação com confirmação AJAX, preservando texto, imagem, respostas, votos e histórico.
- Capacidades e origem do arquivamento são verificadas no servidor; a restauração própria não desfaz decisões administrativas nem aprova conteúdo pendente.
- Arquivamento, interações e finalização de imagem passam a serializar pelo tópico; conflitos com suspensão administrativa retornam erro recuperável.
- Ajuda e guia atualizados. Sem novas áreas principais, dependências ou ativação de integrações externas.

## 0.1.5 · 2026-11-23

- Vitrine de cursos aprovada integrada ao catálogo real, com destaque, capas tipográficas quando não cadastradas e fileiras horizontais.
- Retomada baseada no progresso confirmado pelo servidor; busca e paginação preservadas, com indicação do recorte de cada página.
- Acesso restrito e imagens privadas mantêm os controles existentes. Ajuda e guia acompanham a nova navegação.
- Sem dependências novas, migração de banco ou ativação de provedores externos.

## 0.1.4 · 2026-11-23

- Guia identificado e agrupado com a conta, com alvos visíveis no celular e retorno de foco ao pausar.
- Avaliação da ajuda separada do suporte; anexos e ações de certificados agrupados.
- Hierarquia das abas administrativas, grade de provedores, foco de editores e quebra de nomes longos corrigidos.
- Revisão de layout por famílias e verificações locais documentadas, sem mudança de permissões ou integrações.

## 0.1.3 · 2026-11-23

- Recuperação de senha junto do campo, cadastro em frase no rodapé e confirmação de email exibida somente quando o Auth indicar pendência.
- Destino interno, login AJAX e desafio MFA preservados; nenhum reenvio automático de email.


## 0.1.2 · 2026-11-23

- Ações de privacidade e confirmação administrativa agrupadas com espaçamento e quebra responsiva; política em linha própria.
- Materiais com download abaixo da descrição no celular; títulos e seções de conta/comunidade separados.
- Atalhos e disclosures com área mínima de 44px, identificação de membros sem nome e controles nativos coerentes com os temas Icarus.
- Mensagens públicas com largura de leitura, contraste de placeholders e checkboxes alinhados; ajuda e guia atualizados.
- Revisão visual documentada por superfície/estado e revisão independente de fonte; limites de dados, provedores e dispositivos físicos permanecem explícitos.

## 0.1.1 · 2026-11-23

- Login em painel delimitado, com botão principal de largura inteira e layout conferido a 360/1280px.
- Desafio 2FA no mesmo formulário AJAX do login, com foco no código, erro inline e destino interno preservado.
- 2FA opcional para todos os papéis: ativação em Sua conta → Segurança. Após ativado, AAL2 continua obrigatório no SQL e na Edge.
- Tema claro explícito na abertura; preferência escura continua por escolha do usuário. Preferências escuras criadas pelos testes na demo foram removidas.
- Migration19 altera somente a decisão de exigência MFA, sem novos grants; helper do primeiro administrador alinhado à ativação opcional.

## 0.1.0 — 2026-11-23

- Nova implementação React/TypeScript/Supabase após remoção da aplicação anterior.
- Design System Icarus, cursos e materiais privados, progresso e certificados.
- Comunidade com moderação humana, suporte em threads e administração.
- Auth nativo, primeira senha por convite, MFA, sessões e permissões no servidor.
- Integrações configuráveis, operação e demonstração locais; sem cobrança ou homologação externa implícita.
- Código original MIT, com licenças de terceiros preservadas.
