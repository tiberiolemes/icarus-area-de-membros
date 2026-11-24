# Arquivamento da própria publicação

Complemento do escopo aprovado de Fase 1 + comunidade manual, confirmado em 23/11 após a vitrine 0.1.5. A análise de qualidade prevê editar/arquivar próprio e preservação do histórico. A tela atual oferece edição, mas só a operação administrativa permite arquivar.

## Contrato da menor entrega

- Nova RPC `app_archive_post(p_id uuid, p_archived boolean)` retorna `{id,status,archived}`. Identidade e sessão vêm de `ica_private.actor()`, nunca do cliente. Exige titularidade, acesso vigente ao espaço e estado permitido, com trava da linha e auditoria na mesma transação. Negação não revela conteúdo alheio.
- O autor arquiva somente estados `pending`, `approved` ou `rejected`. Pode restaurar somente o que ele mesmo arquivou e apenas para o estado anterior permitido. Restaurar pendente/rejeitado não aprova; conteúdo ocultado/removido por moderação não é recuperado por esse caminho.
- Guardar de modo durável quem fez o arquivamento, sem inferir isso pela ordenação dos logs. A operação administrativa existente também marca o ator do arquivamento; assim o autor não desfaz um arquivamento administrativo. Arquivados antigos sem autoria conhecida não recebem permissão de restauração própria por suposição.
- DTO `Post` recebe `can_archive` e `can_restore`, calculados no servidor. `can_edit` é falso em `archived` e `removed`, coerente com a escrita existente. O marcador interno do arquivamento não precisa ser exposto.
- O arquivamento próprio é reversível e usa confirmação no mesmo fluxo AJAX. Não cria exigência nova de senha para essa ação pessoal; reautenticação de ações administrativas críticas continua intacta. Preservar ID, texto, imagem, criação, respostas, votos e histórico. Não excluir fisicamente.
- Arquivado fica legível ao autor e equipe conforme os gates existentes; os demais membros não o veem. O autor alcança a restauração no próprio permalink e no feed, que já admite seus estados não publicados. Não criar outra seção ou botão sem consumidor.
- Impedir novas respostas, votos/denúncias em respostas e alteração de imagem de um tópico arquivado, inclusive por chamada direta. Nenhum upload pendente pode reabrir o post ou aprová-lo. Restaurar respeita os gates do espaço e da moderação.
- A tela usa os componentes Icarus existentes, confirmação, erro/recuperação, bloqueio de duplo envio e retorno de foco. Atualizar o detalhe e invalidar o feed somente após confirmação do servidor; cancelar não escreve. Para moderação/admin, manter as operações existentes e sua autorização.

## Prova necessária

Migration incremental sem reset. Grants fechados a PUBLIC/anon e apenas authenticated para a nova RPC; funções privadas continuam privadas. Testes SQL revertidos: titular A/B, anon, suspensão/acesso revogado, estados de moderação, restauração anterior, auditoria, arquivamento administrativo sobreposto, repetição/concorrência e conteúdo/relacionamentos preservados. Verificar interação com upload e com respostas arquivadas.

Frontend com transporte controlado deve cobrir capacidades verdadeiras/falsas, cancelamento, envio/erro/retentativa, bloqueio durante a escrita e atualização real do estado. A coordenação aplica/testa no ambiente local somente após revisar fonte e preservar backup; confere HTTP/navegador com fixtures próprias, 360 px e dois temas, antes de revisão independente e publicação. Não é nova homologação de integrações externas ou revisão global das 294 regras.
