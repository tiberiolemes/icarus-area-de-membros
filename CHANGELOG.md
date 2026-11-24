# Changelog

## Não lançado

- As tabelas do Icarus em `public` passam a usar o prefixo `ica_` (por exemplo, `public.ica_profiles`), assim como os índices nomeados, e o esquema interno muda de `app_private` para `ica_private`. Isso permite instalar o Icarus em um projeto Supabase compartilhado sem misturar nem alterar tabelas de outros sistemas. A liberação de RLS e grants da migration 001 agora alcança só as tabelas `ica_`.
- Projeto Supabase compartilhado: a migration 041 limita os gatilhos de `auth.users` aos usuários do Icarus. O perfil passa a nascer na validação final do cadastro, e só para contas com marcador do Icarus. Cadastros de outros sistemas não ganham perfil nem são recusados. Uma conta que já existia no projeto precisa de bootstrap manual.
- As migrations foram editadas no lugar. Uma instalação criada antes desta mudança precisa ser recriada do zero, porque não existe migration de renomeação.
- Turnstile nas telas de entrar, cadastrar, recuperar senha e reenviar confirmação quando `VITE_TURNSTILE_SITE_KEY` estiver definido; o token segue para o CAPTCHA do Supabase Auth, que o confere no servidor.
- A confirmação de senha da Edge `reauthenticate` usa a chave de serviço, que o CAPTCHA do Auth não exige.

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
