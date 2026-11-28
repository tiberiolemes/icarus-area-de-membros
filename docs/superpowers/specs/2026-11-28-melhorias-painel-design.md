# Melhorias do painel e da área do aluno (2.13.0)

## Intenção

Tibério listou 15 ajustes em 28/nov/2026 depois de usar o painel para montar cursos. O objetivo é que quem cria conteúdo trabalhe sem atrito: vincular e desvincular materiais, excluir o que não serve mais, reordenar arrastando, enviar arquivos num padrão único e consultar a ajuda sem perder o que estava fazendo. A interface também precisa ficar fiel ao design system (DS) do Icarus. Tudo sai num PR e numa versão só, a 2.13.0, conforme a decisão de juntar frentes simultâneas.

## Objetivos

Numeração igual à do pedido.

1. Editar o vínculo de um material com aulas (hoje o servidor recusa com "O vínculo original deve ser preservado").
2. Um material pode ficar em várias aulas, escolhidas por checkbox.
3. Excluir para sempre, sem pedir senha, com uma zona de perigo: aulas, seções, módulos, materiais e pastas de materiais.
4. No editor da aula, adicionar materiais que já nascem vinculados a ela.
5. Recolher a barra lateral, na área do aluno e no painel.
6. O rodapé da barra lateral (Área do aluno, Central de ajuda, Sair, e no aluno Configurações, painel e tema) fica fixo; só a navegação rola.
7. Reordenar a estrutura do curso arrastando e soltando, mantendo as setas.
8. Todo campo de upload segue o modelo de área de arraste enviado por Tibério (imagem 3).
9. Todo link de ajuda dentro do sistema abre num popup com o ícone "Abrir em uma nova janela".
10. Rascunho local em todos os formulários, para recuperar o que foi digitado se a aba fechar ou cair.
11. Remover o contorno escuro fora do DS do filtro de aulas e de qualquer outro elemento com o mesmo defeito.
12. Botão "Editar apresentação" na lista de cursos.
13. A lupa da busca do aluno ganha fundo preto e ícone branco no tema claro, e o inverso no escuro.
14. Buscar os vídeos da biblioteca do Bunny direto do campo de vídeo da aula.
15. A plataforma deixa de receber vídeo: some o envio de MP4 da aula, do material e do anexo de suporte.
16. Criar conta ganha tela de sucesso (pedido de Tibério em 28/nov/2026, depois da aprovação do plano). Hoje o formulário é AJAX, mas depois de enviar a tela fica igual: mesmo título, campos preenchidos, senha apagada, Turnstile reiniciado, um aviso pequeno no topo (fora da vista no celular) e "Salvo com sucesso." ao lado do botão, o que parece recarga. O mesmo acontece em Recuperar acesso e Reenviar confirmação, que entram juntas porque o defeito é o mesmo código (`Access` em `src/pages/access.tsx`).

Imagens de referência enviadas por Tibério, que valem como especificação visual: `~/ai/projetos/icarus-area-de-membros/imagens/2026-11-28-melhorias-painel/` (01 vínculo do material, 02 rodapé da barra, 03 modelo de upload, 04 contorno do filtro, 05 lupa da busca, 06 campo do Bunny, 07 arquivo de vídeo).

Item 10, parte da pergunta: todos os formulários já são AJAX. O componente `Form` e os seis `<form>` soltos (busca, filtros, apresentação da aula) fazem `preventDefault` e chamam RPC. O único `window.location.assign` é o redirecionamento intencional do checkout para o pagamento.

## Não objetivos

- Excluir curso para sempre (Tibério pediu aulas, módulos, materiais, seções e pastas).
- Vincular material já existente a partir do editor da aula. O vínculo de materiais existentes se faz pela tela Materiais, com os checkboxes do item 2.
- Arrastar e soltar nas listas de Configurações (espaços da comunidade, perguntas do onboarding). O item 7 trata o botão Reordenar da estrutura do curso.
- Arrastar uma aula de uma seção para outra. O servidor continua proibindo trocar a seção de uma aula; o arraste vale dentro da mesma lista.
- Miniaturas dos vídeos do Bunny na busca, porque a CDN pode exigir token.
- Salvar no servidor sem clique (autosave remoto). Tibério escolheu rascunho local.
- Remover vídeos já enviados. Aulas e materiais com MP4 já guardado continuam tocando e baixando.

## Antiobjetivos

- Perder dado sem o admin ver antes o que será apagado.
- Apagar certificado já emitido ou invalidar a verificação dele.
- Guardar senha, chave de integração, dado de pagamento ou de login no navegador por causa do rascunho.
- Abrir caminho para o cliente decidir acesso a material, papel ou exclusão. Toda regra fica no servidor.
- Deixar o rodapé da barra ou a barra recolhida inacessível por teclado ou leitor de tela.
- Quebrar o fluxo atual de recorte da foto de perfil, da prévia de logo ou do print do feedback ao trocar o campo de upload.

## Restrições

- `AGENTS.md`: Ponytail full, DS Icarus (Inter e tokens oficiais), alvo de 44 px, campo de 16 px, teclado, 360 px, dois temas. Alteração de tela acompanha a Central de ajuda e o tour.
- RLS e grants mínimos em toda tabela e RPC nova (skill `supabase-grants-checklist`). Funções que recebem `p_actor_id` só para `service_role`.
- Migrations com `begin;` e `commit;` em linhas próprias (há teste que confere).
- Sem dependência nova.
- `localStorage` sempre dentro de `try/catch`, e a tela funciona sem ele.
- A demo (`demo/transport.ts`, `demo/fixtures.ts`) precisa responder às RPCs e ações novas, para as telas abrirem no modo demo.

## Abordagens consideradas

Tibério falou de resultado e deixou o como comigo. As escolhas abaixo são minhas.

- **Vínculo material e aula.** Escolhida: tabela `material_lessons` com chave estrangeira em cascata nos dois lados. Descartada: lista de IDs (`uuid[]`) no próprio material, porque é menor, mas sem chave estrangeira deixaria IDs de aulas inexistentes depois das exclusões do item 3.
- **Exclusão definitiva.** Escolhida: Edge Function chama uma RPC só de `service_role` que apaga as linhas e devolve os caminhos de arquivo; a função então remove os arquivos pelo Storage. Descartada: só SQL, porque o Supabase não permite apagar objeto do Storage por SQL e o arquivo ficaria ocupando espaço pago.
- **Arrastar e soltar.** Escolhida: arraste nativo do navegador (HTML5), sem biblioteca. As setas seguem para teclado e toque, onde o arraste nativo não funciona. Descartada: dnd-kit, que arrastaria também no toque, mas é dependência nova para algo que as setas já cobrem.
- **Popup de ajuda.** Escolhida: o mesmo renderizador de artigo da Central de ajuda dentro do modal do DS. Descartada: iframe da página de ajuda, que recarregaria o app inteiro dentro do popup.
- **Rascunho local.** Escolhida: dentro do componente `Form`, que quase todo formulário usa, mais o editor de apresentação, que tem formulário próprio. Descartada: um gancho por tela, que deixaria telas de fora.
- **Upload.** Escolhida: um componente de área de arraste usado em todos os campos. Descartada: estilizar só o `input type="file"`, que não permite arrastar nem segue o modelo.
- **Busca no Bunny.** Escolhida: ação nova na função `capabilities`, que já lê as credenciais do Bunny. Descartada: chamar a API do Bunny pelo navegador, que exporia a chave.

## Como funciona

### 1 e 2. Material em várias aulas

Banco (migration nova):

- `public.material_lessons(material_id, lesson_id)`, chave primária composta, as duas colunas `not null` com `on delete cascade`, índice em `lesson_id`. RLS ligado e `revoke all` de `public, anon, authenticated, service_role`, como as demais tabelas acessadas só por RPC.
- Copia os vínculos de `materials.lesson_id` e remove a coluna. O índice `materials_parent` passa a cobrir só `folder_id`.
- Recriar, a partir da versão mais recente de cada uma, toda função que lê `materials.lesson_id`. Conhecidas: `app_private.material_access` (material sem vínculo segue a regra atual; com vínculos, o membro precisa acessar **pelo menos uma** das aulas vinculadas, além de pasta e plano), `app_lesson` (lista de materiais da aula pelo vínculo), `app_private.material_json` (devolve `lesson_ids` em vez de `lesson_id`), `app_admin_list` e `app_admin_save` no ramo `materials`, `app_export_data` e `app_materials`. Quem constrói confirma a lista com `grep` nas migrations.
- `app_admin_save('materials', ...)` passa a aceitar `lesson_ids` (lista) e substitui o conjunto inteiro. Recusa aula inexistente e lista com mais de 200 itens. A trava "O vínculo original deve ser preservado" sai só para material; continua para curso, módulo, seção, aula e pasta.

Tela Materiais, editor do material:

- O select "Aula vinculada" vira o grupo "Aulas vinculadas", com checkboxes agrupados por curso e módulo, um campo "Filtrar aulas" acima e a contagem "N aulas selecionadas".
- Lista aulas não arquivadas e também as arquivadas já vinculadas (com o selo Arquivado), para não sumirem do vínculo sem querer.
- Na listagem de arquivos, a linha mostra "Em N aulas" quando há vínculo.

Material que perde a última aula (escolha minha): quando o vínculo some por "Desvincular" no editor da aula ou pela exclusão da aula, o material volta para rascunho. Sem isso, um material criado na aula com "Todos os membros" ficaria aberto para qualquer conta. Na tela Materiais, o admin vê estado e regra de acesso no mesmo formulário em que desmarca as aulas, então ali vale o que ele salvar. Que materiais de aula também apareçam na raiz da biblioteca do aluno (com o acesso conferido) é comportamento atual e não muda.

### 3. Exclusão definitiva

Itens: aula, seção, módulo, material e pasta de materiais. Papéis: os mesmos que podem editar cada item hoje (admin e instrutor para conteúdo e materiais).

O que se apaga:

- **Aula:** progresso, favoritos, notas, comentários (com respostas, curtidas e denúncias ligadas a eles), apresentação e checklist, vínculos com materiais, registros de upload e o arquivo de vídeo enviado, se houver. Os pontos de ranking que dependem do progresso dessa aula somem com ele.
- **Seção:** as aulas dela, como acima.
- **Módulo:** as seções e aulas dele e o lançamento no catálogo ligado ao módulo.
- **Material:** vínculos, registros de upload e o arquivo.
- **Pasta:** as subpastas e os materiais dentro delas, como acima.
- **Fica:** certificados já emitidos (guardam nome, curso, duração e IDs de aulas como cópia) e o registro de auditoria da exclusão, com o nome do item, para a lista de auditoria continuar legível.
- **Materiais vinculados:** materiais que ficam sem nenhuma aula depois da exclusão voltam para rascunho (ver itens 1 e 2).

Certificado e aula obrigatória (escolha minha): hoje, arquivar uma aula obrigatória a mantém em `courses.required_lesson_ids`, e o currículo não muda. A exclusão retira as aulas apagadas de `required_lesson_ids` **sem** aumentar `curriculum_version`. Assim, quem já tem certificado não ganha um segundo nem pontos de ranking em dobro, o certificado antigo continua aparecendo no curso, e quem concluiu as demais obrigatórias passa a poder emitir o certificado. O gatilho `curriculum_changed` só roda em insert e update; a RPC de exclusão faz esse ajuste ela mesma. A página de verificação de um certificado emitido precisa continuar funcionando quando IDs de `lesson_ids` não existem mais.

Servidor:

- `app_admin_delete_preview(p_entity, p_id)` para `authenticated`, com a mesma checagem de papel, devolve o que será apagado: quantidade de seções, aulas, materiais, subpastas, alunos com progresso e comentários, mais quantos materiais apagados estão vinculados a aulas (na pasta) e quantos materiais voltarão para rascunho (na aula, seção e módulo).
- `app_admin_delete(p_actor_id, p_entity, p_id)` só para `service_role`: checa papel, aplica limite por minuto, trava as linhas, apaga na ordem das dependências, grava auditoria e devolve os caminhos de arquivo apagados.
- A Edge Function que já cuida do Storage (`upload`) ganha a ação `delete`: chama a RPC e remove os arquivos. Se a remoção do arquivo falhar, a exclusão no banco vale mesmo assim; a resposta avisa e o erro vai para o log.

Tela:

- No fim do editor de aula, seção, módulo, material e pasta, abaixo de "Arquivar registro", uma caixa "Zona de perigo" com borda e ícone de erro do DS e o botão "Excluir para sempre".
- O botão abre o modal do DS "Excluir [item] para sempre?", com o resumo do `preview` ("3 aulas, progresso de 12 alunos e 4 comentários serão apagados"), a frase "Não dá para desfazer. Certificados já emitidos continuam válidos." e os botões Cancelar e "Excluir para sempre". Sem senha e sem digitar o nome.
- Depois de excluir: fecha o editor, atualiza a lista e mostra a confirmação.

Arquivar sem senha (decisão de Tibério): "Arquivar registro" e "Restaurar registro" deixam de pedir a senha (`Reauth` e `consume_reauth` saem de `app_admin_archive` e do componente `Archive`). Ficam a confirmação na tela, o papel conferido no servidor, o limite por minuto e a auditoria. `docs/CONTRACT.md` é atualizado. O `window.confirm` atual do arquivar vira o modal do DS, como o da exclusão.

### 4. Materiais no editor da aula

- Aula já salva: bloco "Materiais da aula" no editor, com a lista dos vinculados (nome, tipo, tamanho, link "Editar em Materiais" e ação "Desvincular") e a área de arraste do item 8.
- Soltar um arquivo cria o material (nome do arquivo sem extensão, pasta raiz, regra de acesso "Todos os membros", porque quem controla é a aula) vinculado à aula como rascunho, envia o arquivo e só então publica. Se o envio falhar, o material fica na lista como rascunho "Sem arquivo", com opção de reenviar ou excluir.
- Aula nova, ainda não salva: "Salve a aula para adicionar materiais."

### 5. Recolher a barra lateral

- Botão no topo da barra, só no desktop: "Recolher menu" e "Expandir menu", com ícones `PanelLeftClose` e `PanelLeftOpen`, `aria-expanded` e `aria-controls`.
- Recolhida: largura de cerca de 72 px, só ícones; o nome de cada item fica para leitor de tela e aparece como dica ao passar o mouse e ao focar pelo teclado. Rótulos de grupo somem. A marca vira só o ícone da instalação (favicon) ou o do Icarus.
- Estado guardado por navegador, separado para painel e área do aluno. O menu do celular (gaveta) não muda.
- A transição de largura dura 160 ms e respeita `prefers-reduced-motion`.

### 6. Rodapé fixo da barra lateral

- A barra deixa de rolar inteira; só a área de navegação rola (`min-height: 0` e `overflow-y: auto`). O rodapé fica preso embaixo, com uma linha de divisão do DS. Vale para painel, aluno e barra recolhida.

### 7. Arrastar e soltar na estrutura

- Com Reordenar ligado, módulos, seções nomeadas e aulas da mesma seção ganham uma alça (`GripVertical`) que arrasta. Uma linha mostra onde o item vai cair. Soltar fora da própria lista não faz nada.
- Ao soltar, grava as novas posições pelo mesmo caminho das setas (`order_index` dos itens que mudaram). Enquanto grava, o arraste fica desligado; erro mostra aviso e recarrega a estrutura.
- A dica passa a "Arraste pela alça ou use Subir e Descer para mudar a ordem."

### 8. Área de arraste em todos os uploads

Modelo da imagem 3, com os tokens do DS:

- Caixa com borda tracejada, fundo `surface-muted`, cantos do cartão. Centralizados: ícone `FolderOpen` no traço do DS, em cinza (o emoji colorido da imagem fica de fora porque o DS não aceita cor fora da paleta), "Arraste o arquivo aqui" em semibold, "ou", botão secundário "Selecionar arquivo" e a linha de dica com tipos e limite ("PDF, imagem, ZIP, TXT ou MP3 · PDF até 5 MB, imagem até 500 KB").
- Estados: arrastando por cima (borda contínua na cor de ação), foco no botão, desabilitado durante o envio, arquivo escolhido (nome, tamanho e "Trocar arquivo"), enviando (progresso sem percentual e "Cancelar envio"), sucesso e erro (aviso do DS).
- Soltar aplica as mesmas regras de tipo e tamanho do seletor.
- Em tela de toque, onde não dá para arrastar, somem "Arraste o arquivo aqui" e "ou"; ficam o botão e a dica.
- Escolher ou soltar já inicia o envio no componente `Upload`. Onde hoje há um passo de confirmação próprio, ele continua: recorte da foto de perfil, prévia e confirmação da logo, print do feedback que vai junto com o formulário.
- Campos cobertos: capa do curso, material, materiais da aula (item 4), imagem do post da comunidade, anexo do suporte, foto de perfil, logos, ícone e assinatura em Configurações, print do feedback.

### 9. Ajuda em popup

- Componente de link de ajuda que abre o modal do DS, em largura de leitura, com o artigo (categoria, título, resumo, passos, dicas, relacionados e a avaliação "Este artigo ajudou?").
- No cabeçalho do modal, um botão-ícone `ExternalLink` com rótulo e dica "Abrir em uma nova janela", que abre o artigo na Central em nova aba.
- Link para outro artigo dentro do popup troca o conteúdo do próprio popup, com "Voltar" ao anterior. Link externo continua abrindo em nova aba.
- O renderizador do artigo sai de `help.tsx` e passa a ser usado pela página e pelo popup.
- Links cobertos: "Ajuda da administração" de todas as telas do painel, "Ajuda sobre conteúdo", "Ajuda sobre encontros", "Ajuda sobre certificados", o da comunidade, os da página de suporte, o do tour e o do checkout. Os da página de suporte e do checkout que apontam para a página inicial da Central abrem a página inicial (busca e assuntos) dentro do popup.
- Ficam como página, porque são o destino e não um desvio: o item "Central de ajuda" do menu e o link da tela de entrada.

### 10. Rascunho local

- `Form` guarda os campos no `localStorage` meio segundo depois de cada digitação, com a hora. A chave combina usuário, endereço da tela, rótulo do formulário e um identificador opcional do registro (`draftKey`), que as telas com vários registros na mesma rota passam (editor de material, pasta, itens da estrutura).
- Ao abrir o formulário com um rascunho diferente do que está salvo, aparece o aviso "Há um rascunho não salvo de hoje às 14:32." com "Recuperar rascunho" e "Descartar". Recuperar preenche os campos, inclusive o editor de texto rico e os checkboxes, e marca o formulário como alterado.
- Apaga o rascunho: salvar com sucesso, Descartar, qualquer fim de sessão (Sair, sessão expirada ou encerrada pelo servidor, pelo evento `SIGNED_OUT` do Supabase; apaga todas as chaves de rascunho do Icarus) e rascunho com mais de 7 dias.
- Nunca guarda: campo `password`, campo marcado `data-sensitive` ou `data-no-draft`, arquivos, e os formulários de entrada, segundo fator, troca de senha, reautenticação, credenciais de integração e checkout. Também ficam de fora, por guardarem dado pessoal de outra pessoa (escolha minha): a ficha do membro no painel, o atendimento de pedidos de privacidade e os motivos de moderação e de denúncia.
- O editor de apresentação da aula, que tem formulário próprio, ganha o mesmo comportamento.
- O aviso de alterações não salvas que já existe continua.

### 11. Contorno fora do DS

- Remover a borda `#6b7280` desenhada em `.stitch-curriculum-field::before` (`src/lesson-stitch.css`, tema claro no desktop) e o espaçamento que compensava essa borda.
- Varredura: bordas e contornos com cor fixa fora dos tokens, em pseudo-elementos ou em campos dentro de outro campo. Achados iniciais para conferir: `src/pages/lesson-presentation.css` (linhas 231, 281 e 301). Corrigir o que for defeito e manter o que for intencional, com o motivo no relatório.
- O anel de foco do DS (2 px, afastado 3 px, `--stitch-focus`) continua.

### 12. Editar apresentação a partir da lista de cursos

- A apresentação (pontos de destaque, fórmula, checklist e chamada para ação) é de cada aula. O botão "Editar apresentação" na linha do curso abre um modal com as aulas do curso agrupadas por módulo, cada uma levando ao editor de apresentação dela.
- Aulas arquivadas ficam de fora. Curso sem aulas mostra o vazio com o link para "Estrutura e aulas".

### 13. Lupa da busca do aluno

- O botão da lupa usa `--ic-action` de fundo e `--ic-on-action` no ícone, que já se invertem no tema escuro; o hover usa o token de hover de ação. Vale para as larguras em que a lupa é um botão separado do campo, como na imagem 5. Quem constrói confere no navegador se a versão desktop pede o mesmo e relata.

### 14. Buscar vídeo no Bunny

- Ao lado do campo "Vídeo do Bunny ou link do YouTube", o botão "Buscar no Bunny" abre um modal com busca por título e lista paginada (título, duração e "Processando" quando o vídeo ainda não está pronto). "Usar este vídeo" preenche o ID e a duração em segundos, se houver, fecha o modal e marca o formulário como alterado.
- Servidor: ação `bunny-videos` na função `capabilities`, para admin e instrutor, fora da demo, com limite por minuto. Chama `GET https://video.bunnycdn.com/library/{id}/videos` com `search`, `page` e `itemsPerPage`, tempo máximo de 8 s, e devolve só `id`, `title`, `length` e `status`. A chave nunca sai do servidor. Texto até 100 caracteres, página de 1 a 1000.
- Sem Bunny configurado: o botão some e a dica do campo aponta para Configurações > Integrações (para o instrutor, avisa que o admin precisa configurar).

### 15. Sem envio de vídeo

- Editor da aula: sai o bloco "Arquivo de vídeo" e a frase "Salve a aula para enviar um arquivo de vídeo".
- Servidor recusa: `kind = 'lesson'` na função `upload` e em `app_upload_access`, e `video/mp4` em qualquer envio (material, anexo de suporte). Mensagem: "A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube."
- O que já foi enviado continua tocando e baixando (`app_media_access` e `media` sem mudança). O tipo "Vídeo MP4" continua só como rótulo de materiais antigos; sai das opções de escolha.
- Dicas, artigos e o guia de operação deixam de citar MP4 de até 500 MiB.

### 16. Tela de sucesso no cadastro e na recuperação

- Ao enviar com sucesso, o formulário some e entra uma tela de confirmação no mesmo quadro, com ícone de email, título "Confira seu email" (o foco vai para ele) e o endereço digitado em destaque.
- Criar conta: "Se o endereço puder ser cadastrado, você vai receber um link de confirmação em {email}. Abra a mensagem e clique no link para ativar sua conta." e "Não chegou em alguns minutos? Confira a pasta de spam ou reenvie a confirmação." Ações: "Voltar para entrar" (principal) e "Reenviar confirmação".
- Recuperar acesso: "Se houver uma conta com {email}, você vai receber um link para criar uma nova senha." Ações: "Voltar para entrar" e "Enviar de novo" (volta ao formulário).
- Reenviar confirmação: "Se houver uma confirmação pendente para {email}, enviamos um novo link." Ação: "Voltar para entrar".
- O texto continua sem dizer se o email já existe, para não revelar quem tem conta, como hoje.
- "Salvo com sucesso." deixa de aparecer nessas telas.

### 17. Avançar para a próxima aula automaticamente

Pedido de Tibério em 28/nov/2026, depois da aprovação do plano: uma opção que, marcada, leva o aluno à próxima aula ao terminar o vídeo ou ao marcar a aula como concluída. Escolhas minhas, para ele conferir:

- A opção é do aluno e vale para a conta inteira, como o tema: coluna `profiles.auto_advance boolean not null default false`, aceita por `app_profile` e devolvida no perfil. Começa desligada.
- Fica na tela da aula, junto de "Marcar como concluída", como interruptor com o texto "Avançar para a próxima aula automaticamente".
- Ao clicar em "Marcar como concluída" com a opção ligada, depois de o servidor confirmar, a tela vai direto para a próxima aula.
- Ao terminar o vídeo com a opção ligada, a aula é marcada como concluída (a mesma chamada do botão, para o progresso não ficar para trás) e aparece "Próxima aula em 5 segundos" com "Ir agora" e "Cancelar". Sem a opção, terminar o vídeo continua sem marcar nada, como hoje.
- Não avança quando não há próxima aula, quando o aluno não tem acesso a ela ou quando a conclusão emitiu certificado (para ele ver o aviso do certificado).
- Fim do vídeo: Bunny pelo evento `ended` do player.js; YouTube pela API de mensagens do iframe (a função `media` passa a pedir `enablejsapi=1` no endereço do player, e a tela escuta o estado "terminado" vindo só da origem do YouTube); vídeo e áudio antigos guardados na plataforma pelo `ended` nativo.

### 18. Planos em formato de venda, com a menor parcela em destaque

Pedido de Tibério em 28/nov/2026, depois da aprovação do plano: a aba Assinatura da conta do aluno (`src/pages/settings.tsx`, "Planos disponíveis") passa a mostrar os planos num formato mais vendável, sempre com o valor parcelado menor em destaque. Imagem de referência do estado atual: `~/ai/projetos/icarus-area-de-membros/imagens/2026-11-28-melhorias-painel/08-planos-atual.png`.

- Cartões lado a lado (um por linha no celular), com os tokens do DS: nome do plano, duração ("12 meses de acesso"), a parcela em destaque, o valor à vista embaixo, benefícios com ícone de check e o botão "Assinar" na largura do cartão. O plano atual mostra o selo "Seu plano atual" no lugar do botão.
- Menor parcela: o checkout aceita até 12x, então o destaque é `12x de` o preço dividido por 12, arredondado para cima no centavo (nunca promete menos do que será cobrado). Plano gratuito (preço 0) mostra "Gratuito", sem parcela.
- Juros (decisão de Tibério, opção por instalação): cada plano ganha a marcação "Parcelamento sem juros no cartão" no formulário de Planos (`plans.interest_free boolean not null default false`). Marcado: "12x de R$ 49,00 sem juros" e "ou R$ 588,00 à vista". Desmarcado: "em até 12x de R$ 49,00 no cartão", "ou R$ 588,00 à vista" e, em letra menor, "Valor final da parcela confirmado no pagamento.". A dica da marcação explica que ela só deve ficar ligada quando a conta do Asaas não repassa juros ao aluno, e o guia de operação diz o mesmo.
- Sem selo "Mais popular", desconto ou economia: o Icarus não tem esses dados e não inventa.
- Fora do escopo: o seletor de parcelas do checkout continua como está.

### 19. Avatar automático com Gravatar e imagem padrão

Pedido de Tibério em 28/nov/2026, depois da aprovação do plano. Imagem de referência: `~/ai/projetos/icarus-area-de-membros/imagens/2026-11-28-melhorias-painel/09-avatar-perfil.png`. Ordem de precedência: foto enviada pelo aluno (soberana), foto do Gravatar, imagem padrão gerada.

- Foto do Gmail fica de fora (decisão de Tibério): o Google só entrega a foto a quem entra com a conta Google, e o Icarus não tem esse login. "Entrar com Google" com a foto do perfil fica como pendência de um próximo PR.
- Gravatar (decisão de Tibério): o servidor busca, guarda e serve a foto; quem vê não fala com o Gravatar. Na primeira entrada de quem não tem foto, a tela pede à função `upload` a ação `gravatar`. O servidor calcula o SHA-256 do email (minúsculo, sem espaços), consulta `https://gravatar.com/avatar/<hash>?s=160&d=404` (5 s), aceita só JPG ou PNG de até 100 KB com assinatura válida, guarda pelo mesmo caminho do avatar enviado e só grava em `profiles.avatar_id` se ele ainda estiver vazio. 160 × 160 px (escolha minha, em vez dos 100 sugeridos): o perfil mostra a foto com 80 px e telas retina usam o dobro; fica entre 5 e 15 KB.
- `profiles.gravatar_checked_at` registra a consulta com resposta definitiva (foto guardada ou 404), para não repetir. Erro de rede ou tempo esgotado não marca, e a consulta volta no próximo acesso. Limite por minuto por pessoa.
- Foto enviada depois substitui a do Gravatar, como qualquer troca de foto.
- Imagem padrão (decisão de Tibério): Boring Avatars, variante `beam`, nas cores do DS (`#000000`, `#1F1F1F`, `#8A8A8A`, `#EAEAEA`, `#FFFFFF`), com a semente no ID da conta, então cada pessoa tem sempre a mesma imagem. Aparece no topo (aluno e painel), no perfil e nas publicações da comunidade, no lugar das iniciais e do ícone de pessoa.
- LGPD: o guia de operação avisa que o hash do email vai ao Gravatar (Automattic) e que a política de privacidade da instalação deve dizer isso; o artigo de privacidade da Central também.

## Decisões de Tibério (28/nov/2026)

- Item 10: rascunho local em todos os formulários, sem autosave no servidor.
- Item 12: "Editar apresentação" é o editor de pontos de destaque, fórmula, checklist e chamada para ação.
- Item 15: o material em MP4 também sai.
- Item 3: a exclusão definitiva vale também para seções e pastas de materiais.
- Item 3: arquivar e restaurar também deixam de pedir senha, por coerência com a exclusão sem senha.

## Escolhas minhas, para Tibério conferir

- Material com várias aulas abre para quem acessa qualquer uma delas.
- Material que fica sem nenhuma aula (desvincular ou aula excluída) volta para rascunho.
- Excluir aula obrigatória tira ela da exigência do certificado sem gerar segundo certificado.
- Instrutor também pode excluir para sempre, como já pode editar e arquivar.
- Excluir pasta apaga subpastas e materiais dentro dela, com aviso de quantos estão em aulas.
- Rascunho local fica fora da ficha do membro, dos pedidos de privacidade e da moderação.
- Material criado no editor da aula nasce com "Todos os membros", porque quem controla o acesso é a aula.
- Sem envio de vídeo também no anexo de suporte (consequência de "a plataforma deixa de guardar qualquer vídeo").
- Escolher o arquivo já inicia o envio, sem o botão "Enviar arquivo".
- Em tela de toque a área de arraste mostra só o botão e a dica.
- Ícone de pasta no traço do DS em vez do emoji.
- Menu "Central de ajuda" e o link da tela de entrada continuam como página.

## Deixado para quem constrói

- Onde extrair o renderizador de artigo e como o popup guarda a navegação interna.
- Formato exato da chave e da serialização do rascunho, e como o `RichEditor` recebe o valor recuperado.
- Ordem exata das exclusões no banco e lista final das tabelas ligadas a aula, conferida no esquema.
- Ícone da marca na barra recolhida quando a instalação não tem favicon.
- Textos finais de dicas e artigos, seguindo a regra de escrita do Tibério.

## Verificação

- Testes de tela (Vitest): vínculo por checkbox e filtro, preview e modal de exclusão, materiais no editor da aula, barra recolhida com estado guardado e acessível, ordem calculada no arraste, área de arraste (soltar, tipo recusado, envio automático, fluxos com confirmação própria), rascunho (salva, recupera, ignora campos sensíveis, apaga ao salvar e ao sair), popup de ajuda (abre, navega, link de nova janela), modal de apresentação por curso, busca no Bunny preenchendo os campos.
- Testes de banco (`supabase/tests`): migração preserva os vínculos, acesso por qualquer aula vinculada, `lesson_ids` substitui o conjunto e recusa aula inválida, exclusão de cada tipo com as dependências e os papéis, grants (`service_role` só onde há `p_actor_id`), certificados intactos depois da exclusão, aula obrigatória excluída sem mudar `curriculum_version` e sem segundo certificado, material sem aula voltando para rascunho, arquivar sem senha, recusa de `kind = 'lesson'` e de `video/mp4`.
- Testes das Edge Functions: `bunny-videos` (papel, limite, chave fora da resposta, erro da API) e `delete` (remove arquivos, falha do Storage não desfaz o banco).
- Navegador real (Chrome, 360 px e desktop, os dois temas), em sequência: criar aula, soltar um material, vincular o mesmo material a outra aula pela tela Materiais, excluir a primeira aula e conferir que o material segue na segunda; recolher e expandir a barra e navegar com ela recolhida; arrastar aulas e módulos; abrir a ajuda de três telas e a nova janela; recuperar um rascunho depois de recarregar; conferir o filtro de aulas e a lupa. Envio e exclusão de arquivo conferidos no stack real, porque a demo não tem Storage.
- Verificação local antes do PR: typecheck, Vitest, testes de banco e build. Orçamento de CI estimado antes de abrir o PR.

## Entrega

- Versão 2.13.0 com `CHANGELOG.md`, artigos da Central de ajuda e passos do tour das telas alteradas, `docs/CONTRACT.md`, dicionário de dados e guia de operação (migration nova e fim do envio de vídeo).
- Um PR no repositório público, sem merge nem publicação sem autorização de Tibério. A instalação dele recebe depois, pelo `ORIGEM.md`.
