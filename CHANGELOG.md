# Changelog

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
