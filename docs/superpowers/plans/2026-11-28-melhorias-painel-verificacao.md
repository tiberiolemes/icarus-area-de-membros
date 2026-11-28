# Verificação da 2.13.0

Registro da Task 21 do plano [2026-11-28-melhorias-painel.md](2026-11-28-melhorias-painel.md), feito em 28/nov/2026 sobre o branch com as tarefas 1 a 20 integradas (`da62a10`), já com a versão 2.13.0, o CHANGELOG, o guia de operação e o contrato atualizados.

## Comandos e resultados

Rodados em sequência, na ordem do plano. Todos saíram com código 0.

| Passo | Comando | Saída | Resultado |
| --- | --- | --- | --- |
| Tipos | `npm run typecheck` | 0 | Sem erros |
| Telas | `npm test` | 0 | 70 arquivos e 641 testes passaram |
| Edge Functions | `node scripts/test-integrations.mjs` | 0 | 95 testes passaram e nenhum falhou (Deno 2.9.8) |
| Instalador | `node --test scripts/clean-install.test.mjs scripts/local.test.mjs` | 0 | 23 testes passaram |
| Instalação limpa do banco | `SUPABASE_PROFILE=supabase supabase --workdir <cópia> db reset` | 0 | 67 migrations aplicadas em ordem, de `202611230001` a `202611280007`, e a seed |
| Testes de banco | 43 arquivos `supabase/tests/*.sql` | 0 em todos | 1.672 asserções |
| Build | `npm run build` | 0 | Sem avisos |
| Build da demo | `npm run build:demo` | 0 | Sem avisos |

O banco descartável é uma cópia de `supabase/` com `project_id` próprio e portas 5873x, no Supabase CLI 2.109.1. Antes do reset, as 67 migrations e a seed do branch foram copiadas por cima das da cópia. Cada teste rodou com `docker exec -i <container> psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres < arquivo` e passa quando sai 0 e a última linha antes do `ROLLBACK` é a contagem de asserções.

Os cinco testes de concorrência em Python (`catalog_launch_concurrency.py`, `certificate_profile_lock_concurrency.py`, `outbox_concurrency.py`, `post_archive_concurrency.py` e `ranking_concurrency.py`) exigem o ambiente oficial e não rodaram aqui.

### Testes de banco por arquivo

| Arquivo | Saída | Asserções |
| --- | --- | --- |
| `admin_analytics.sql` | 0 | 58 |
| `admin_operations.sql` | 0 | 56 |
| `admin_review.sql` | 0 | 33 |
| `auth_creation.sql` | 0 | 17 |
| `auto_advance.sql` | 0 | 11 |
| `backend.sql` | 0 | 117 |
| `bunny_search.sql` | 0 | 5 |
| `catalog_launches.sql` | 0 | 42 |
| `certificate_defaults.sql` | 0 | 38 |
| `certificate_signature.sql` | 0 | 27 |
| `checkout_throttle.sql` | 0 | 16 |
| `content_delete.sql` | 0 | 43 |
| `course_cover_focus.sql` | 0 | 31 |
| `course_showcase.sql` | 0 | 10 |
| `default_sections.sql` | 0 | 22 |
| `feedback.sql` | 0 | 66 |
| `followup.sql` | 0 | 36 |
| `gravatar.sql` | 0 | 20 |
| `installation_brand.sql` | 0 | 33 |
| `installation_logo.sql` | 0 | 69 |
| `installation_modules.sql` | 0 | 111 |
| `integration_credentials.sql` | 0 | 34 |
| `lesson_engagement.sql` | 0 | 120 |
| `lesson_presentation.sql` | 0 | 108 |
| `lesson_youtube.sql` | 0 | 4 |
| `live_events.sql` | 0 | 40 |
| `logout_nonce_cascade.sql` | 0 | 16 |
| `material_lessons.sql` | 0 | 27 |
| `member_search.sql` | 0 | 30 |
| `mfa_outbox.sql` | 0 | 45 |
| `no_video_upload.sql` | 0 | 9 |
| `notifications.sql` | 0 | 59 |
| `optional_mfa.sql` | 0 | 25 |
| `plan_interest_free.sql` | 0 | 9 |
| `podcast_watch_export.sql` | 0 | 15 |
| `podcasts.sql` | 0 | 38 |
| `post_archive.sql` | 0 | 86 |
| `post_edit_image.sql` | 0 | 42 |
| `ranking.sql` | 0 | 44 |
| `remember_session.sql` | 0 | 27 |
| `security_retention.sql` | 0 | 20 |
| `session_rpcs_volatile.sql` | 0 | 1 |
| `upload_limits.sql` | 0 | 12 |

## Navegador

Modo demo (`npx vite --mode demo --host 127.0.0.1 --port 8091 --strictPort`) num Chromium isolado do Playwright, sem o perfil do Chrome do Tibério. Cada combinação de 360 px e 1280 px com tema claro e escuro abriu uma sessão nova, como administrador. O tema escuro foi forçado no atributo `data-theme`, porque a conta da demo usa o claro. As 121 capturas ficam na pasta de artefatos de QA do projeto (`qa-2-13/task-21`), fora do repositório.

O resultado foi o mesmo nas quatro combinações, salvo onde está indicado.

1. Criar aula e soltar um material. Em Estrutura e aulas, **Adicionar aula** criou "Aula de QA" e a contagem passou a 1 módulo e 4 aulas. No editor, um PDF solto na área de arraste de **Materiais da aula** criou o material "Apostila-qa" já vinculado à aula. Como a demo não tem Storage, o envio respondeu "Esta operação exige uma instalação do Icarus." e o material ficou como "Rascunho · Sem arquivo", com **Editar em Materiais**, **Reenviar arquivo** e **Desvincular**, como a spec prevê para envio que falha.
2. Vincular a outra aula pela tela Materiais. O editor do material mostrou **Aulas vinculadas** com **Filtrar aulas** e os grupos por curso e módulo. Marcar "Defina os objetivos da trilha" levou a contagem a "2 aulas selecionadas", e a linha da lista passou de "Em 1 aula" para "Em 2 aulas".
3. Excluir a primeira aula. A **Zona de perigo** abriu "Excluir esta aula para sempre?" com "Não dá para desfazer. Certificados já emitidos continuam válidos." e "Serão apagados: 1 aula.". Confirmar voltou a estrutura para 3 aulas e mostrou "Excluído.".
4. O material seguiu na segunda aula. O bloco **Materiais da aula** de "Defina os objetivos da trilha" lista "Apostila-qa", e a linha em Materiais diz "Em 1 aula".
5. Barra lateral. A 1280 px, **Recolher menu** (com `aria-expanded` verdadeiro antes do clique) recolheu a barra para 72 px, com a dica "Materiais" ao passar o mouse. O ícone levou a `/admin/materiais`, e a barra continuou recolhida depois de recarregar. **Expandir menu** voltou ao normal. Na área do aluno, o mesmo, navegando até Cursos com a barra recolhida. A navegação rola sozinha (`overflow-y: auto`) e o rodapé fica fixo. A 360 px o botão não aparece, e a gaveta mantém o rodapé visível embaixo.
6. Arrastar. Com **Reordenar** ligado e a dica "Arraste pela alça ou use Subir e Descer para mudar a ordem.", a terceira aula arrastada pela alça foi para o topo, com a linha de destino visível, e o segundo módulo arrastado foi para o primeiro lugar.
7. Ajuda em popup, aberta de três telas. **Ajuda da administração** em Cursos e aulas abriu "Criar um curso do zero", **Como funciona o atendimento** em Suporte abriu "Abrir um chamado e falar com a equipe" e **Ajuda sobre encontros** em Encontros ao vivo abriu "Participar dos encontros ao vivo". A tela de origem não mudou. O botão **Abrir em uma nova janela** tem `target="_blank"` e abriu o mesmo artigo numa aba nova (`/app/ajuda/criar-curso`, `/app/ajuda/suporte` e `/app/ajuda/encontros`).
8. Rascunho. Em Materiais, digitar o nome em **Novo material**, recarregar a página e abrir **Novo material** de novo mostrou "Há um rascunho não salvo de hoje às 14:52." com **Recuperar rascunho** e **Descartar**. Recuperar preencheu o nome.
9. Filtro de aulas. Na aula, o campo "Filtrar tópicos e aulas..." não tem mais o contorno escuro (o `::before` sai sem conteúdo e sem borda), nos dois temas e nas duas larguras. Com foco por teclado aparece o anel de foco do DS.
10. Lupa da busca do aluno. A 360 px, fundo preto e ícone branco no tema claro e o inverso no escuro, com 44 × 44 px. A 1280 px a lupa fica dentro do campo, sem fundo próprio, como decidido na Task 16.
11. Assinatura. A demo entrega ao aluno só o plano gratuito das fixtures, então dois planos pagos foram acrescentados ao módulo de fixtures em tempo de execução, sem tocar no código, e a sessão foi refeita. Os cartões mostram "Gratuito" com "Seu plano atual", "12x de R$ 49,00 sem juros" com "ou R$ 588,00 à vista" e "em até 12x de R$ 97,00 no cartão" com "ou R$ 1.164,00 à vista" e "Valor final da parcela confirmado no pagamento.". A 360 px fica um cartão por linha, sem rolagem horizontal. O formulário de Planos salvou um plano com **Parcelamento sem juros no cartão** marcado ("Plano salvo com sucesso.").
12. Avanço automático. Na aula 1.1, o interruptor **Avançar para a próxima aula automaticamente** ficou ligado (`aria-checked` verdadeiro), e **Marcar como concluída** levou direto à aula 1.2.
13. Avatar. Sem foto, o topo do aluno e o do painel mostram a imagem padrão do Boring Avatars (variante beam), nos dois temas.
14. Largura. Sem rolagem horizontal a 360 px em Cursos e aulas, no editor da aula, em Materiais e no editor do material, em Planos, na janela de **Editar apresentação**, na área do aluno, na aula, em Suporte, em Configurações e na Central de ajuda.

O único erro de console foi "this.program: /in.pdf: can't find startxref", do otimizador de PDF lendo o PDF mínimo de teste, que não tem tabela xref. Nesse caso o envio segue com o arquivo original. Nenhum erro de página.

## Defeitos encontrados

Nenhum foi corrigido nesta tarefa.

1. Materiais, lista de arquivos (2.13.0). Material sem arquivo aparece com tipo e tamanho, enquanto o bloco da aula diz "Sem arquivo". Na demo sai "Rascunho · PDF · NaN B", porque a criação pela aula não manda `size_bytes` e o transporte simulado não aplica o padrão 0 do banco. No banco real sairia "0 B". Impacto baixo (`src/pages/admin.tsx`, linha 1201, e `demo/transport.ts`).
2. Configurações da conta, abas (anterior a esta versão, desde a 0.2.0, em `src/pages/account-settings.css`). No tema claro, a aba selecionada com o mouse em cima fica com texto branco sobre fundo claro (`rgb(244, 244, 245)` com texto `rgb(255, 255, 255)`), ilegível. Sem o mouse volta ao fundo preto. A regra de hover de `.student-account :is(.button, button)` empata em especificidade com a da aba selecionada e vem depois. É o mesmo tipo de defeito corrigido na 2.11.0 no editor de curso.
3. Anel de foco do filtro de aulas no tema escuro (anterior a esta versão, já anotado na revisão da Task 16). A 1280 px o anel fica a cerca de 14 px do campo, e não a 3 px como no tema claro.

## Limitações

- A demo não tem Storage nem a função `upload`. Envio e exclusão de arquivo de verdade, a remoção do arquivo no Storage depois da exclusão e a recusa de vídeo pela Edge não aparecem no navegador. Estão cobertos pelos testes de Edge e de banco e precisam ser conferidos no stack real.
- A demo deixa `capabilities.bunny` falso, então **Buscar no Bunny** não aparece. A busca está coberta pelos testes de tela e de Edge.
- A demo responde `{avatar: false}` ao pedido do Gravatar. A busca real não foi exercida.
- Na área do aluno, a demo monta o curso sem ordenar as aulas por `order_index`, então a ordem arrastada só aparece no painel. Isso é da demo e anterior a esta versão.
- O cadastro fica fechado na demo, então a tela de sucesso do Criar conta não abre ali. Está coberta pelo Vitest e pelas capturas da Task 17.
- A contagem "Próxima aula em 5 segundos" no fim do vídeo não foi exercida no navegador, porque a aula testada é de texto. Está coberta pelo Vitest.
