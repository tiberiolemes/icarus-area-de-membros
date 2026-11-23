# Revisão geral de layout · 0.1.4

Pedido do titular: conferir o guia deslocado no cabeçalho e o suporte colado à avaliação da ajuda, e revisar o restante do protótipo com Impeccable. Mantidos DS Icarus, Inter, claro inicial e preferência escura por conta.

## Correções

- Guia e conta agrupados no cabeçalho. O guia tem nome visível; no celular a conta conserva nome acessível e alvo44×44 sem exigir a linha de nome/plano.
- Avaliação do artigo e abertura de suporte em seções distintas, separadas por32px. Sim/Não permanecem juntos.
- Uma hierarquia de título principal por página; listas dentro de abas usam títulos de seção e itens subordinados.
- Provedores em pares nome/estado na grade de fatos.
- Editores inline recebem foco e rolagem ao abrir e retornam ao disparador ao fechar. Salvar/Fechar editor e Enviar/Descartar usam o mesmo agrupamento de ações; os controles ficam bloqueados durante o envio.
- Nomes, slugs, pastas e currículo admitem quebra de texto longo. Anexos e ações de certificados usam gap/wrap.
- O guia coleta alvos visíveis quando aberto, incluindo o botão do menu compacto. Avançar tem destaque; Pausar devolve o foco ao acionador. A conclusão de aula tem destaque sem mudar sua operação.

Ajuda alinhada. Não houve mudança de API, SQL, Edge, grants, planos, pagamentos, emissão, dependências ou autenticação.

## Verificação e cobertura

50 testes frontend em8 arquivos, build/typecheck e detector de layout concluídos. Revisão independente por fonte e dois adendos sem defeito demonstrável no delta. Os testes de transporte controlado e as ações nativas são provas distintas.

Foram percorridas50 superfícies/estados de aluno/admin e14 públicas em1280 claro e360 escuro, com quadros superiores e inferiores quando necessários. Há complementos do cabeçalho em768/1024 e da ajuda em1280 escuro/360 claro. As imagens foram inspecionadas em montagens de quadros nativos; medidas DOM e hashes acompanham a leitura. O recibo JSON lista os recortes, sem transformar isso em todas as combinações de estado, dados, papel e navegador.

Na aplicação local real: abertura/pausa do guia por teclado, alvo visível de navegação desktop/mobile, foco do painel/retorno ao botão e abertura/fechamento de um editor passaram. A ajuda mediu32px entre avaliação e suporte. Nomes longos foram fixtures de exibição somente no DOM, sem salvar os valores no banco.

## Identidade e histórico das provas

O adendo de agrupamento mudou somente Form, seus consumidores e o teste. Os28 recortes principais sem esse consumidor ativo são herdados por equivalência de fonte/CSS; Nova publicação e os editores foram conferidos novamente. A medida final encontrou o alvo compacto da conta com40×44; corrigido para44×44 e retestado no cabeçalho em cinco variantes. Reverter essa única propriedade reproduz o hash CSS anterior. As medidas antigas não foram reescritas como44px.

Os primeiros testes expuseram o nome acessível concatenado do guia, corrigido para texto único. Um probe leu foco antes de terminar o fechamento assíncrono; a leitura assentada e a fase completa posterior passaram. O primeiro seletor administrativo incluiu a rota de criação; duas séries de quadros de aula/certificado não chegaram ao estado solicitado. Esses ensaios foram preservados e excluídos; a retomada usou foco/Enter e guardas explícitas do estado antes da captura.

Provas locais em `icarus-layout-pass-20261123`; nenhuma credencial foi incluída. Não houve reset de dados, edição de conteúdo, troca de papel/plano/senha ou encerramento global de sessão. O guia registra seus eventos nativos. Temas temporários de QA foram restaurados para claro.

## Limites

Não é nova homologação de checkout, SMTP, Asaas/Bunny, restauração, leitor de tela, dispositivo físico ou todos os estados possíveis. Não foram fabricados pedidos financeiros, múltiplos anexos, primeiro onboarding, reautenticação crítica ou moderação para obter imagens. Cadastro e cobrança continuam dependentes da configuração e dos documentos aprovados. As verificações anteriores desses fluxos permanecem identificadas por sua versão, sem nova execução inferida. GitHub Actions segue inativo por decisão do titular; o aviso existente de bundle acima de500kB permanece.

A revisão anterior deixou passar relações de agrupamento apesar da regra existente do Impeccable. Foi falha de execução; nenhuma nova regra global foi criada.
