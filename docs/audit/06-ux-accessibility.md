# Revisão visual e acessibilidade · 0.1.2

A revisão anterior da 0.1.1 era focada no login. Ela não comprovava revisão visual de todas as telas. A reclamação sobre as ações de Privacidade iniciou este inventário de aluno, administração e páginas públicas, seguido de correções agrupadas e recheck do build.

Aplicados Ponytail full e Impeccable (contexto do produto, layout, craft e inspeção do resultado), preservando Inter, tokens e componentes oficiais Icarus. O detector de layout terminou sem achados; isso não substitui inspeção visual. Não houve biblioteca nova, migration, mudança de autorização ou integração externa neste patch.

## Correções

| Superfície | Problema comprovado no baseline | Ajuste |
| --- | --- | --- |
| Privacidade | Exportar, excluir e link legal encostados | Grupo de ações com gap12px e wrap; política em linha própria com alvo44px |
| Materiais na pasta e na aula | Descrição comprimida no celular pelo botão de download | Ícone e texto na primeira linha; ação na linha seguinte |
| Segurança e tópico da comunidade | Títulos Sessões e Respostas sem separação | Espaço de seção32px no contexto de leitura |
| Atalhos de conta, curso, ajuda, tópico e ficha | Áreas de ação menores que44px | Altura mínima nas classes de ação e links de títulos; links de texto corrido preservados |
| Membros | Título vazio quando o cadastro não tinha nome | Fallback “Membro sem nome” com ID curto real, na lista e ficha; dados não são alterados |
| Ficha do membro | Concessões com alvo curto; autorizar e cancelar encostados | Summary44px, separação entre seções e grupo de ações com gap/wrap |
| Controles nos dois temas | Calendário nativo preto no escuro e placeholder sem contraste suficiente | Color-scheme explícito e placeholder pelo token secundário Icarus |
| Páginas públicas e ajuda | Avisos excessivamente largos, checkbox separado do texto e feedback sem gap | Painel/medida de leitura, label contínuo e agrupamento das ações |

[Revisão independente de fonte](visual-focused-review.md).

## Método e evidência

O inventário [visual-coverage-0.1.2.json](visual-coverage-0.1.2.json) identifica superfícies, variantes, origem da evidência e limites. Conta superfícies e estados concretos, incluindo abas e formulários; não é uma contagem de funcionalidades ou de todos os registros possíveis.

- Baseline aluno/conta: 28 superfícies/estados, 112 combinações de 1280×900 ou 360×800 com claro/escuro, 172 imagens abertas.
- Baseline administração: 45 superfícies/estados, 180 combinações, 277 imagens abertas. Formulários longos incluem rolagem e regiões inferiores.
- Primeira senha e onboarding: conta QA exclusiva criada pela API Auth nativa, sem papel/plano especial. Primeira senha enviada pela UI e destino de onboarding observado; somente aparência do onboarding, sem concluí-lo.
- Páginas públicas: acesso, callback inválido, documentos demo, ajuda e seus artigos, checkout indisponível, pedido sem recibo, certificado demo/válido/inválido e404. Não foi habilitado provedor para fabricar estados de venda.
- Recheck da 0.1.2 nas classes e telas afetadas; as capturas restantes do baseline são herdadas explicitamente por equivalência de componente e fluxo, sem alegar nova execução.
- 39 testes frontend passaram em sete arquivos, incluindo dois casos de ficha sem nome. Typecheck e build de produção passaram. A suíte usa transporte controlado quando indicado nos testes.
- Impacto restrito à apresentação e fallback de identificação; consumidores compartilhados conferidos. GitHub Actions segue inativo: nenhum minuto de runner foi consumido por este patch.
- O primeiro recheck encontrou um consumidor adicional: link de módulo em h3, ainda com 25px. A regra44px foi estendida somente a .curriculum h3 > a e um segundo build passou. As provas anteriores permanecem identificadas por equivalência; curso e aula receberam recheck próprio.
- Revisão independente de fonte e do complemento final não encontrou defeito demonstrável; confirmou handlers, argumentos, fronteiras e dependências preservados.

Capturas foram abertas para inspeção; arquivos apenas gerados não são contados como revisados. Imagens transitórias ou com escala de compositor inconsistente foram descartadas e identificadas nos recibos locais. Tema escuro foi uma fixture de DOM sem salvar preferências. Claro foi restaurado ao encerrar os perfis de QA. As imagens e medições completas permanecem no pacote local de evidências; o JSON público contém identificação e hashes sem credenciais ou conteúdo privado.

## Limites explícitos

Não se declara “100% de todos os estados”. Listas vazias não aprovam detalhes populados. Não foram criados pedidos, denúncias ou solicitações de exclusão para preencher telas nesta auditoria. Detalhes sem fixture, perguntas de onboarding já salvas, respostas pendentes/rejeitadas, segunda página de listas pequenas e erros remotos que não ocorreram naturalmente estão identificados como `NOT_VERIFIED`.

As provas funcionais anteriores continuam separadas em [release 0.1.0](../acceptance/release-0.1.0.md) e [login 0.1.1](../acceptance/login-0.1.1.md). Elas não viram novas execuções desta revisão visual. Não foram repetidos testes de cobrança, banco ou infraestrutura por causa deste patch de apresentação.

A conta QA exclusiva de acesso foi removida ao fim. A primeira submissão por clique não disparou o formulário e o probe foi invalidado; o envio nativo por teclado abriu o onboarding. A limpeza inicial foi recusada por referência de auditoria; as sessões próprias foram encerradas e somente o ator QA transitório dessa linha foi anonimizado, preservando a linha de auditoria antes de remover perfil e Auth. Nenhuma conta ou histórico anterior foi alterado.

Não houve leitor de tela, dispositivo físico, certificação WCAG integral, homologação Asaas/Bunny/SMTP externo ou operação no servidor do titular. CI continua preparado, mas inativo por decisão do responsável. O aviso existente de bundle acima de 500kB foi mantido e não foi tratado como ganho de desempenho.

## Aprendizado aplicado

A exigência de verificar o resultado renderizado já existia. O erro foi confundir o recheck focado do login com cobertura global e deixar agrupamentos fora do padrão compartilhado. A correção usa o mesmo DS e registra separadamente fonte, imagens abertas, recheck e estados sem prova; não cria outra regra ou auditoria permanente.
