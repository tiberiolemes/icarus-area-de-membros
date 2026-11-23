disposition: ship

Inputs não fornecidos: comp aprovado, QUALITY BAR separado e contrato THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM; não se presume aprovação. Extensão ordinária em Operate: composição vigente, DESIGN.md e tokens são a autoridade, sem rodada de conceito/seed ou reprodução de comp a exigir.

## persistence

Pass no recorte 0.1.6 de arquivar/restaurar a própria publicação. PRODUCT.md, DESIGN.md, contrato do fluxo, ajuda e tour existem e correspondem à extensão do DS Icarus. Os 13 hashes de inputs do manifesto conferem com os arquivos atuais; o JSON acompanha os valores e distingue leitura de fonte de simples conferência de hash. Nenhuma alteração em código, Git, DB ou runtime.

Evidência válida: abri visualmente as 20 imagens nomeadas no manifesto, em lotes de quatro, e conferi seus hashes. São viewports de 1440×900 ou 360×800, não fullpage; as medidas height do manifesto descrevem o documento, não a altura dos PNGs. Os estados arquivados incluem início e fim do histórico separadamente, nos dois temas. As confirmações mostram o diálogo inteiro; a restauração conserva o scroll anterior no fundo, sem invalidar a captura do estado. Não há falha de captura, conteúdo em branco indevido ou corte da ação no diálogo. O preto das imagens escuras é o tema, com conteúdo legível.

## fidelity

Inventário visual anterior à leitura do contrato: trilho lateral Icarus de navegação no desktop; cabeçalho compacto com menu no celular; retorno à comunidade; metadados de autoria/data/estado; título forte; corpo de leitura; ações de texto e botões contornados; resposta histórica separada por linha; avisos de estado; diálogo central com descrição, confirmação contrastante, cancelar e fechar. Esse inventário permanece coerente entre os estados.

| Elemento | Classificação | Evidência e autoridade |
| --- | --- | --- |
| TYPE | match | Inter auto-hospedada na fonte, títulos e corpo com hierarquia consistente nas capturas; DESIGN.md e tokens oficiais. |
| MATERIAL | match | Superfícies planas, contornos finos, ícones Lucide e sombra somente no overlay; nenhuma imitação de material físico ou asset obrigatório substituído. |
| GROUND | match | Campos branco/preto e diálogo branco/cinza-900 coerentes com os tokens e com o resultado visível. Inspeção visual e CSS; amostragem programática de pixels não realizada, pois Pillow não está disponível. |
| Topologia e navegação | match | Mesmos componentes, ordem de leitura e permalink; sem nova seção ou navegação especulativa. |
| Reflow compacto | adaptation | Ações quebram em linhas e confirmação ocupa a largura útil a 360px; necessidade responsiva explicitamente pedida, sem overflow visível ou reportado. |
| Confirmação e recuperação | match | Diálogos explicam ocultação, preservação e restauração ao estado anterior; cancelar e fechar permanecem localizáveis. Modal justificado pela transição que afeta visibilidade. |
| Histórico arquivado | match | Texto e resposta continuam legíveis nas capturas de início/fim; voto, denúncia e nova resposta deixam de ser oferecidos ao membro. Restauração visível antes das respostas. |
| Estado restaurado | match | Mensagem informa o estado real; ações retornam e resposta histórica permanece na captura desktop. Captura móvel mostra a parte superior, sem alegação de inspeção visual do fim restaurado. |
| Delta de moderação | match | community.tsx:489 exige can_moderate e status diferente de archived para o tópico; :511 mantém a autorização das respostas. PostPage atende rotas membro e admin. A regressão em community-archive.test.tsx:61 distingue o controle restante dentro da resposta; resultado baseline/final é relato do Root, não execução minha. |

Promessas do fluxo conferidas individualmente: (1) escopo próprio usa capacidades can_archive/can_restore do servidor, sem inferência de autor no cliente; (2) arquivar/restaurar é AJAX com confirmação, lock contra envio repetido e bloqueio de fechamento durante escrita; (3) histórico e estado anterior são explicados sem prometer aprovação; (4) detalhe é relido e feed invalidado após sucesso, erro permanece recuperável e foco retorna pelo Modal ou pelo contêiner quando a capacidade desaparece; (5) ajuda e tour descrevem o controle e sua limitação a arquivamento próprio. Os cinco blocos formais de direção não foram fornecidos e não são inventados nesta revisão de extensão.

Modal conserva open/onOpenChange opcionais, mantendo consumidores sem controle externo em denúncia e configurações. Form mantém validação, erro focalizável e fieldset ocupado. A fonte do teste do Modal existente foi lida; não executei testes. Nos PNGs e métricas fornecidas, controles do fluxo têm pelo menos 44px; CSS mantém campos em 16px, foco de 2px/offset3px e redução de movimento. Preferência clara inicial é autoridade do produto e da fonte CSS; a seleção inicial por conta não foi reexecutada por mim.

Truth/floor: conteúdo QA está explicitamente marcado como demonstração/sintético; nenhuma oferta ou prova comercial inventada. Metadados acima do título informam autoria, data e estado, não funcionam como eyebrow decorativo. Nenhum gradiente, sombra dura, ícone de glifo, faixa lateral decorativa ou cartão aninhado foi demonstrado no fluxo. detector.json fornecido contém []; não executei outro detector.

## ceiling

Acabamento operativo consistente com DESIGN.md: hierarquia contida, contraste monocromático, separação das respostas e confirmação protegida. Sem QUALITY BAR separado, não afirmo equivalência com card ausente nem proponho expressão ou motion adicional. Não há dispositivo visual necessário ao escopo que tenha ficado demonstravelmente ausente.

## material_fixes

Nenhum defeito material demonstrado; nenhuma correção solicitada. Ship aplica-se somente ao acabamento visual e ao delta de fonte deste fluxo 0.1.6, nas evidências fornecidas, e não significa publicação, aceite humano ou aprovação de 100% do produto.

Resultados frontend76/10, build/typecheck, SQL334, outbox4, runner35checks/8corridas/8esperas/cleanuptrue, NativeAuth19 e baseline falhando/final passando foram relatados pelo Root. native-uat.json fornecido declara arquivar/restaurar200 na mesma SPA, cancelar/Escape sem escrita, retorno de foco, negação a outro ator, conteúdo preservado e tema claro restaurado. Source-review/recheck e runner-review foram lidos somente para situar os gates já separados; não repeti auditoria backend nem reexecutei prova. Não verifiquei leitor de tela, toque/dispositivo físico, homologação externa, CI ou produção. A inspeção estática de CSS/fonte não substitui esses testes.

## keep

Preservar DS Icarus/Inter, claro inicial e escolha escura por usuário, componentes existentes, confirmação explícita, erro recuperável, foco, capacidades do servidor e histórico legível sem exclusão física.
