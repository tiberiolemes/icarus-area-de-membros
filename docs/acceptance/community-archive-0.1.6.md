# Arquivamento próprio 0.1.6

Complemento da comunidade manual previsto no escopo da primeira versão. O autor pode arquivar e restaurar sua publicação pelo detalhe ou pelo permalink acessível no feed. Não foi criada outra área principal.

## Comportamento entregue

A confirmação ocorre na mesma SPA. Cancelar e Escape não escrevem; durante o envio os controles ficam bloqueados. Sucesso depende da resposta do servidor, atualiza o detalhe e invalida o feed, com retorno de foco. Falha mantém o diálogo e permite nova tentativa. A restauração informa o estado efetivo, sem anunciar aprovação de conteúdo pendente ou rejeitado.

O arquivamento preserva ID, texto, imagem vinculada, criação, respostas e votos. O histórico fica disponível ao autor e à equipe conforme os gates existentes, com interações públicas desativadas. Outro membro não lê nem interage com o tópico arquivado. O autor não desfaz arquivamento administrativo, moderação ocultada/removida ou arquivo legado sem origem conhecida. A origem administrativa é explícita mesmo quando administrador e autor são a mesma pessoa.

`app_archive_post(uuid,boolean)` exige identidade, sessão, titularidade e acesso vigente no servidor. Somente `authenticated` recebe EXECUTE; anon, PUBLIC e service_role não recebem. Escrita direta continua negada e RLS permanece ativa. Estado e auditoria mudam na mesma transação; repetição não duplica auditoria. Respostas, votos/denúncias em respostas e reserva/finalização de imagem serializam com o tópico e revalidam seu estado.

## Verificações locais

- Frontend: 76 testes em dez arquivos, typecheck e build passaram. Incluem nove regressões do arquivamento com transporte controlado e consumidores do Modal existente. A regressão adicional reproduziu a oferta de moderação inválida no tópico arquivado; o controle foi removido somente nesse estado, preservando a moderação autorizada das respostas. O aviso anterior de chunk acima de 500 kB permanece.
- SQL: instalação incremental nativa 18 → 20 no QA isolado, com histórico real igual às fontes e impressão de 67 tabelas preservada. Passaram 334 asserts SQL em sete arquivos e, separadamente, quatro verificações de concorrência do outbox. O teste novo cobre 86 asserts de papéis, estados, acesso, restauração, conteúdo, idempotência e rollback; sua redução anterior foi executada em BEGIN/ROLLBACK, sem apresentá-la como aplicação persistente.
- Concorrência do arquivo: oito casos reais em sessões SQL distintas, 35 verificações, oito esperas observadas por `pg_blocking_pids` e cleanup confirmado. Incluem repetição, resposta/voto/reserva/finalização de imagem e as duas ordens de suspensão administrativa. Claims SQL e metadados sintéticos não são Native Auth nem bytes de upload HTTP. O corpo executado do runner e o atual são iguais; a guarda de destino recebeu apenas adaptação de portabilidade, conferida positiva e negativamente.
- Native Auth/HTTP: 19 respostas RPC rastreadas, com autor permitido, outro autor/anon/service_role negados, arquivo ilegível a outro membro e novas interações negadas. Arquivar/restaurar preservou os campos e relações da fixture própria.
- Navegador: duas escritas HTTP 200 reais, arquivar e restaurar, na mesma SPA; cancelar/Escape sem escrita e foco devolvido aos controles. Consulta por outra sessão confirmou bloqueio durante o arquivo e leitura após restauração. Vinte capturas nativas de desktop 1440 px e celular emulado 360 px, nos dois temas, foram abertas e conferidas, com diálogos e início/fim do histórico sem overflow horizontal.

## Revisões e aplicação

A revisão independente inicial encontrou SRC-01, uma espera circular possível entre sessão/perfil e suspensão administrativa. A guarda `FOR KEY SHARE NOWAIT` no próprio perfil, antes do tópico, transforma contenção em erro P0001 recuperável, sem transição ou auditoria parcial. O recheck de fonte considerou o achado resolvido. As duas ordens foram depois exercitadas no runner real, sem deadlock. A revisão independente do runner não encontrou defeito demonstrável no recorte; a coordenação reconciliou o hash do corpo executado.

Antes da aplicação local, backup SQL e binários foi restaurado isoladamente: 67 tabelas e cinco arquivos, com owners, ACL, RLS/policies e permissões por papel iguais. A migration20 foi aplicada por transação incremental explícita, sem reset nem fabricação de histórico no protótipo. Sete preimages e oito corpos finais de função foram comparados; posts anteriores e grants foram preservados. Não houve restart de DB/Auth/Storage/Edge.

Depois da limpeza da fixture própria, uma nova captura pós-schema foi restaurada isoladamente: 67 tabelas, cinco arquivos binários, 342 verificações de EXECUTE por papel e 201 de permissões de tabela, com dados, owners, RLS/policy e ACL iguais. O backup anterior foi preservado separadamente. Não houve remoção de containers, volumes ou imagens. Os 14 arquivos de index/assets servidos pelo preview coincidem byte a byte com o build final.

A [revisão visual independente](community-archive-0.1.6-review.md) deu `ship` somente no fluxo e no delta de fonte fornecidos, abrindo as vinte capturas e conferindo os treze inputs do manifesto. Não encontrou defeito material demonstrável nesse recorte. O [recibo estruturado](community-archive-0.1.6.json) separa as execuções da coordenação, a leitura independente e suas limitações; não atribui os testes ao revisor.

A conferência documental independente considerou a extensão conforme ao sistema incumbente, sem mudança material nova. DESIGN.md e os tokens foram preservados; o formato resumido de DESIGN e a ausência prévia do sidecar do Impeccable foram registrados, sem reparo de configuração fora do pedido.

## Histórico de falhas e limites

A primeira corrida falhou na limpeza de metadados Storage. A recuperação atingiu somente o marcador sintético próprio; o runner passou a usar a opção suportada `storage.allow_delete_query` apenas dentro da transação de cleanup. A execução seguinte passou e deixou cleanup confirmado; a falha original foi preservada. O preview frontend antigo estava encerrado e apresentou conexão recusada: foi iniciado apenas o preview próprio, sem causa histórica inferida nem recriação da infraestrutura.

Ajuda e guia acompanham a alteração. Sem dependências novas, cobranças, ativação de provedores ou mudanças nos critérios MFA. Dispositivo físico, leitor de tela, outros motores, instalação no servidor do titular e Supabase/SMTP/Asaas/Bunny externos não foram homologados por esta entrega. CI continua inativo por decisão do titular; testes locais não são GitHub Actions executado. Não há aceite global de todas as telas ou regras.
