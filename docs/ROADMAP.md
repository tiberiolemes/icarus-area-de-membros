# Escopo da primeira versão

## Incluído
Fase1 de entrega de cursos com comunidade manual: acesso/onboarding/perfil, papéis independentes de plano, curso/módulo/seção/aula, materiais privados, progresso e certificados, checkout configurável, suporte com thread, administração de conteúdo/membros/planos/pedidos, espaços/posts/respostas/votos/denúncias e moderação humana. Ajuda/tours, segurança, integridade e recuperação acompanham os fluxos entregues.

## Etapa posterior à publicação da fonte
O usuário instalará uma cópia no seu servidor e fornecerá as configurações das integrações. Supabase/Asaas/Bunny/email e textos jurídicos reais são configurados e homologados nessa etapa. Não há autorização para criar cloud/Oracle pago ou realizar cobranças nesta entrega.

## Fora desta primeira versão
Ranking, prêmios, DMs, diretório avançado, podcasts, encontros, automações/campanhas, IA, tutor, quizzes/tarefas, multi-tenant e recursos das fases posteriores. Não criar telas ou botões vazios para eles.

O código novo usa MIT e Design System Icarus. O repositório anterior será substituído por commit normal, sem apagar o histórico. Nenhum aceite, dado ou senha da aplicação descartada é herdado.

## Conferência do escopo após 0.1.5

A conferência dirigida de 23/11 encontrou uma lacuna concreta da comunidade: o autor consegue editar, mas não arquivar e restaurar sua própria publicação. O estado arquivado existe no backend, porém a operação atual exige papel administrativo. O complemento está delimitado em `docs/implementation/community-archive.md`; não exige uma nova área principal.

Essa lacuna foi implementada na 0.1.6, com confirmação AJAX, restauração limitada à origem própria, preservação histórica e verificações de papéis, concorrência e navegador. Evidências e limites estão em `docs/acceptance/community-archive-0.1.6.md`. O diagnóstico acima registra a situação encontrada na 0.1.5, não uma pendência ainda aberta.

As demais áreas principais da primeira versão já têm rotas e implementação: acesso/conta, cursos/aulas, materiais, certificados, comunidade, suporte e administração de conteúdo/membros/planos/pedidos/configurações. Isso é inventário de fonte, não aceite de todos os estados ou homologação externa.

Depois desse complemento, as dependências conhecidas continuam sendo conteúdo e oferta reais, documentos jurídicos, instalação no servidor, configuração e homologação Supabase/Asaas/Bunny/email e validação com pessoas/dispositivos físicos. Resumo administrativo e evolução da experiência do curso podem ser priorizados separadamente; notificações completas, mensagens, ranking e demais fases não entram automaticamente neste lote.
