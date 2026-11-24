# Icarus: análise prévia de frontend e DS

23/11/2026. Somente planejamento, sem implementação. Ponytail full, Impeccable (init, new-work, operate) e checklist AJAX aplicados. O coordenador já executou context; não foi repetido. O brief e a resposta do usuário suprem as decisões de produto; não cabe nova escolha de identidade, imagens IA ou inicialização de arquivos nesta tarefa.

## Autoridade e recorte

- Decisão atual: aplicação nova React + TypeScript + Vite, uma organização por instalação, Fase 1 do PRD + comunidade com moderação manual. Não transportar Vue, Frappe, frappe-ui nem suas telas/framework.
- **Decisão direta do usuário nesta análise: claro por padrão inicial; escuro opcional, salvo na preferência de cada usuário e restaurado nos próximos acessos.** Isto substitui RF-NV-04 (escuro inicial), alinha-se ao DS e encerra a divergência.
- PRD completo lido: `PRD fornecido pelo responsável`, sobretudo fases na seção 9. A lista geral das seções 4/5 não autoriza automaticamente todas as fases.
- Identidade e contratos publicados: `fonte oficial do DS Icarus: {especificacao.md,tokens.json,tokens.css,index.html,ds.css}`; gerador `scripts/build-icarus-ds.py`, lido, não executado. O guia distingue marca oficial de propostas técnicas de UI.
- A comunidade acrescida compreende espaços, feed, post, respostas, votos, denúncia e decisão humana. Não implica diretório, DMs, notificações completas, ranking/prêmios ou feedback in-app. Sem podcasts, encontros/RSVP, lista de espera, drip, automações, tutor, comentários por aula, quiz, conquistas ou administração de múltiplas organizações na mesma instalação. Não exibir navegação ou botões para essas funções.
- Community/Pro e preços da referência são exemplos do PRD, não preços aprovados do Icarus. Histórico menciona comunidade anual independente: não deduzir acesso gratuito à comunidade a partir do nome Community; avaliar direito por recurso/vigência. Não confundir comunidade com comentários de aula. Oferta e acesso reais precisam de configuração explícita, sem importar preços/copy da arr.academy.

## Rotas finitas e contratos por tela

Convenção proposta abaixo, sem promessa de URLs já implementadas. `/app` redireciona a `/app/cursos`; `/admin` a `/admin/cursos`. Busca, filtros e página ficam na query string; aba de configurações também. Sem dashboard separado só para preencher uma entrada de menu.

| Superfície | Rotas propostas | Contrato mínimo |
| --- | --- | --- |
| Acesso | `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`, `/auth/callback` | Campos rotulados, senha com revelar acessível, validação inline, confirmação de envio sem enumerar contas; callback trata link expirado/usado e reenvio. Google/link mágico somente quando o provedor estiver configurado. |
| Onboarding | `/app/boas-vindas` | Questionário do admin; etapa e obrigatoriedade explícitas; salvar sem apagar respostas na falha; depois retomar destino original. Dados da empresa editáveis na conta. |
| Oferta e pagamento | `/checkout/:plano`, `/checkout/pedido/:id` | Resumo da oferta real, termos versionados e marketing separado; Pix/cartão, parcelas e totais; pendente/expirado/recusado/pago/estornado distintos. Conta/acesso só após confirmação do servidor; comprador novo recebe definição de senha, membro existente não ganha conta duplicada. |
| Legal | `/termos`, `/privacidade` | Texto/versionamento reais; sem texto inventado para habilitar cobrança. |
| Cursos | `/app/cursos`, `/app/cursos/:curso` | Continuar curso, progresso numérico, catálogo e módulos publicados; distinguir bloqueado por plano de indisponível. Sem módulos futuros com botão de lista de espera. |
| Módulo e aula | `/app/cursos/:curso/:modulo`, `/app/cursos/:curso/:modulo/~<id-da-aula>` | Link por ID preserva o destino quando o slug da aula é editado. Aula atual, anterior/próxima, progresso; vídeo + descrição/materiais + lista recolhível. Mobile empilha player e conteúdos. Sem comentários/quizzes/tarefas/anotações nesta entrega. |
| Materiais | `/app/materiais`, `/app/materiais/:pasta` | Breadcrumb, nome/tipo/tamanho/acesso; baixar por URL autorizada; material vinculado à aula usa a mesma permissão. Arquivo inexistente, token expirado e acesso negado têm mensagens diferentes. |
| Certificados | `/app/certificados`, `/certificado/:codigo`, `/verificar/:codigo` | Em andamento/concluído, faltam N aulas, emissão só após conclusão válida; nome, curso, carga horária, data, código, assinatura real. Verificação válida/inválida/revogada, sem dados privados extras; arquivos PDF/PNG reais antes de oferecer download. |
| Conta | `/app/configuracoes?aba=perfil\|empresa\|seguranca\|assinatura\|privacidade` | Perfil/bio, onboarding, troca confirmada de email/senha, preferência claro/escuro, plano/validade/pedidos, exportação/exclusão com estados e confirmação. Preferências de notificações adiadas junto do módulo. |
| Suporte | `/app/suporte`, `/app/suporte/novo`, `/app/suporte/:ticket` | Lista, assunto/prioridade, conversa com histórico, anexos e reabertura. SLA/contato somente se aprovados. WhatsApp só com destino real configurado. |
| Comunidade | `/app/comunidade`, `/app/comunidade/novo`, `/app/comunidade/:post`, `/app/comunidade/:post/editar` | Filtro por espaço e busca; paginação de 20 com Carregar mais; título manual, espaço, discussão/pergunta, corpo e anexos. Post e respostas com autoria, tempo, selo, voto, denunciar; editar/excluir só quando permitido; permalink restaura filtro/posição ao voltar. |
| Admin de cursos | `/admin/cursos`, `/admin/cursos/novo`, `/admin/cursos/:id` | Um editor com seções Curso, Estrutura, Aula e Certificado; módulos/seções/aulas ordenáveis, acesso, capa, vídeo/processamento, materiais, descrição, CTA real e prévia de rascunho autorizada. Reordenar também com botões/teclado, não só arrastar. Sem editor visual genérico de templates. |
| Admin de materiais | `/admin/materiais` | Pastas/arquivos e vínculos com aulas no mesmo fluxo; upload validado, progresso, cancelar/tentar novamente, publicar/arquivar. |
| Admin de membros | `/admin/membros`, `/admin/membros/:id` | Busca e ficha com plano/vigência, papel, progresso, pedidos e tickets; concessão/revogação explícita com motivo e confirmação. Nenhuma impersonação ou ferramenta de importação complexa presumida. |
| Admin de ofertas | `/admin/planos` | Planos/ofertas, vigência, benefícios, regras de acesso e texto de upgrade; ajustes em painel/diálogo do mesmo recurso. Cupom/order bump só como oferta configurada e suportada no contrato de checkout, sem campanha fictícia. |
| Admin de pedidos | `/admin/pedidos`, `/admin/pedidos/:id` | Status vindo do gateway/servidor, valores, método, histórico e vínculo ao membro. Reembolso/reenvio de documento só quando suportado/configurado; não marcar pago manualmente para simular gateway. |
| Admin da comunidade | `/admin/comunidade?aba=moderacao\|espacos`, `/admin/comunidade/:post` | Pendentes/denúncias e histórico de decisões; aprovar/rejeitar/ocultar/remover, fixar/mover/resolver conforme permissão, motivo e confirmação. Espaços com leitura/postagem por direito real de acesso. |
| Admin de suporte | `/admin/suporte`, `/admin/suporte/:ticket` | Fila por status/prioridade/responsável, resposta com anexo, histórico e encerramento. Reaproveitar thread e formulário do aluno com ações autorizadas. |
| Admin de configuração | `/admin/configuracoes?aba=onboarding\|integracoes\|legal\|equipe` | Perguntas, situação dos provedores, textos/versões e equipe/papéis. Credenciais ficam no servidor. Configuração de marca e gestão de múltiplas organizações ficam fora do recorte inicial. |
| Estados transversais | Tela de 403, 404 e falha recuperável dentro do shell | Não criar menu para estados; sessão ainda carregando não é 403; rota desconhecida oferece retorno real; recurso revogado não revela conteúdo anterior do cache. |

O admin do PRD é inferido. O inventário acima é a recomendação mínima para a operação acordada; BI, funil, MRR, campanhas e automações não são pré-requisitos para cadastrar/entregar um curso. Papéis e plano são eixos independentes; suporte/moderador não recebem acesso financeiro ou editor de conteúdo por conveniência.

## Contrato visual único

- Modo **Operate**, leitura longa em descrição/aula/thread. Shell: trilho 248 px no desktop, topo discreto com identidade/conta, item atual e skip link; abaixo de 1024 px usar gaveta acessível. Aluno: Cursos, Materiais, Certificados, Comunidade, Suporte, Configurações. Admin: Conteúdo, Membros, Planos, Pedidos, Comunidade, Suporte, Configurações, por permissão. Sem sino sem notificações implementadas.
- Fonte `assets/InterVariable.woff2`, pesos 400/500/600/700, licença `Inter-OFL.txt`, auto-hospedada, swap e preload. Tamanhos disponíveis 14/16/20/28/40/64 px; UI usa escala fixa rem, corpo/campos 16, título 28, display somente quando necessário. Leitura até 70ch, tabelas com números tabulares.
- Paleta oficial: `#000000`, `#1F1F1F`, `#8A8A8A`, `#EAEAEA`, `#FFFFFF`. Usar `--ic-background`, `surface`, `surface-muted`, `text`, `text-secondary`, `border`, `border-control`, `action`, `on-action`, `focus` de tokens.css. Não introduzir acento, gradiente ou cor de plano. Erro/sucesso/aviso = ícone + rótulo + texto.
- Claro: fundo/superfície brancos, texto preto, secundário #1F1F1F, ação preta/branco. Escuro: fundo preto, superfície #1F1F1F, texto branco, secundário #EAEAEA, ação branca/preto. `#8A8A8A` sobre branco (3,45:1) não serve a texto pequeno; `#EAEAEA` sobre branco (1,20:1) não delimita controle obrigatório. Usar border-control e foco de alto contraste.
- Espaços em múltiplos de 4 px; raios controle/card/painel/amplo 8/12/20/28 px; sem sombra em repouso. Conteúdo até 1200 px, margem compacta 20 px, breakpoints 640/1024 px. Tabela pode rolar só em região nomeada/focável; nunca provocar rolagem horizontal da página inteira.
- Marca disponível: SVG horizontal 610:160, idêntico byte a byte entre Documents e DS (SHA256 inicia `1fd3c5a3c820`). Preservar desenho/espaço interno; preto em claro, inversão branca do mesmo SVG em escuro. Proposta DS de mínimo 244 px: no trilho compacto usar texto Inter “Icarus / Área de membros”, não espremer a assinatura. Não reconstruir símbolo/wordmark/favicon inexistente.
- Assets presentes: SVG, guia PDF, prancha aprovada PNG e preview social; estes dois últimos não são capas de cursos. Não existem neste pacote fotos/capas de cursos nem assinaturas de instrutor aprovadas: exibir fallback textual honesto até cadastro. Ícones lineares 24 px/stroke 1,75 do sprite do DS podem ser reutilizados; não são símbolos de marca.
- Tema em perfil autenticado, não só localStorage global. Aplicar `data-theme` na raiz, persistir via API, refletir salvando/erro e restaurar após login/outro dispositivo. Cache opcional por ID do usuário, invalidado no logout; nunca herdar preferência de outro membro. Sem preferência: claro. Preferência manual ganha do SO; não adicionar um terceiro modo Sistema sem pedido.

## Componentes mínimos

Reaproveitar tokens e linguagem do DS; não copiar seu `ds.js` (demonstrações sem backend) nem importar uma biblioteca inteira. React + CSS tokens; shadcn/Radix pontual para Dialog/AlertDialog, DropdownMenu, Tabs e Accordion quando necessários, aproveitando portal/foco/teclado. Gaveta usa a mesma primitiva Dialog; nenhum novo motor de componentes/tours.

1. Shell/nav/breadcrumb e cabeçalho de página.
2. Button/link, Field (label/ajuda/erro), input/textarea/select/checkbox/radio nativos, upload nativo.
3. Dialog/confirmation, menu, tabs/accordion; botões ícone rotulados.
4. Card/lista/tabela semânticos, badge/avatar, progress, paginação.
5. Feedback inline, toast, skeleton estático, vazio/erro/indisponível, bloqueio de acesso com upgrade.
6. Composições do domínio: curso/módulo, player/conteúdos, arquivo, thread/compositor (post e ticket), certificado. Não criar um form builder ou data grid genérico para poucas telas.

Todo controle: default/hover/focus/active/disabled/loading/erro. Alvos 44×44 px inclusive fechar, menu, votos e revelar senha; labels persistentes; foco 2 px com offset 3 px; modal contém foco, Escape/Cancelar e devolução ao disparador. Movimento 160 ms e respeitar reduced-motion; não animar ilustração de vazio.

## Estados, AJAX, autoria e retorno

| Estado | Comportamento exigido |
| --- | --- |
| Loading | Skeleton com tamanho reservado e nome acessível; aria-busy por região; não piscar “sem acesso” antes da consulta. Player/thumbnail mantêm proporção. |
| Vazio | Dizer por quê e próximo passo possível: “Nenhum curso publicado”, “Sem resultados, limpar filtros”, “Nenhum ticket”; no admin oferecer criar quando autorizado. Não oferecer ação sem destino. |
| Falha | Erro inline e tentativa na operação que falhou, preservar campos não sensíveis; distinguir validação, sessão expirada, permissão revogada, rede e conflito de edição. Nunca toast de sucesso antes do retorno. |
| Upgrade | Conteúdo restrito exibe metadados permitidos, motivo, benefícios/valor reais e checkout configurado. Recurso oculto não vira vitrine. Oferta ausente: “Assinatura indisponível no momento”, sem link morto. |
| Não configurado | Provedor ausente é estado de capacidade do servidor, não rede/vazio. Aluno recebe mensagem curta; admin vê qual integração falta e como configurar. Não apresentar player falso, QR Pix fictício, cobrança/nota fiscal, email enviado ou download inexistente como reais. |
| Modo local | Fixture/demo explicitamente identificada e separada de integração: simular sucesso, falha, pendência, expiração e revogação sem criar conta externa/cobrança. URL pública de certificado de fixture deve dizer demonstração. Credenciais ausentes nunca ativam fallback que aparenta operação real. |

- Cadastro/login/perfil, ticket, postagem/resposta/voto/denúncia, upload, progresso, moderação, publicar e excluir usam submit interceptado/API e atualização da região, sem reload. Reenvio bloqueado durante a chamada, liberado na falha; validação local e servidor. Links só navegam; nunca GET que remove/aprova. Redirect externo de autenticação é navegação intencional.
- Autoria vem da sessão validada pelo servidor, não do autor/role/plan enviado no formulário. Autor vê suas ações permitidas; moderação é decisão humana registrada com ator/motivo/data. Denúncia entra na fila sem ocultação automática por contagem (substitui proposta RF-CM-15); sem IA para aprovar, gerar título ou punir. Para título vazio, solicitar título ou derivar deterministicamente do início do texto, explicitando a regra.
- Se aprovação prévia estiver habilitada, rótulo “Enviado para revisão”, visível ao autor/moderação, nunca “Publicado” para os demais. Edição não deve promover pendente/rejeitado para visível nem descartar decisão/auditoria. Lista de pendentes e tratamento manual fazem parte da mesma entrega.
- `returnTo` mantém apenas caminho interno validado (sem URL externa, `//` ou segredo), incluindo aula/filtros; cadastro/onboarding/callback/checkout preservam esse destino. Depois de login, reavaliar acesso antes de renderizar; se bloqueado mostrar upgrade, se removido mostrar indisponível. Refresh e voltar/avançar mantêm contexto; troca de conta esvazia caches privados.
- Rascunho útil: manter em memória na falha; persistir apenas campos não sensíveis por usuário/recurso, com descartar e limpeza no logout. Nunca guardar senha/token/CPF/cartão/corpo privado de suporte indiscriminadamente no navegador. Avisar antes de sair de edição não salva, sem confirmação em toda navegação comum.
- Bunny ausente: mensagem no lugar do vídeo e materiais disponíveis conforme direito; local pode usar vídeo fixture identificado. Token expirado renova pelo servidor uma vez com recuperação, sem perder posição. Progresso e certificado são confirmados no backend; tocar/pausar não conclui curso por si.
- Asaas ausente: resumo da oferta pode ser consultado, mas não coletar cartão nem disparar “Pagar”. Estado local testável não é venda. Confirmação visual do checkout não concede acesso: webhook/servidor é autoridade; pedido pendente tem consulta/retry sem duplicar cobrança. Supabase ausente não deve criar sessão aparentemente de produção.

## Verificação antes da futura entrega

Análise não substitui UAT. Verificar o novo app depois de implementado, em lote: 360, 390, 768, 1024, 1440 e 1920 px; claro/escuro; conteúdo longo, zoom 200%, gaveta, menu, modal, abas, upload, player, tabelas e teclado virtual. Medir clipping, sobreposição e foco com barra sticky; lista de aulas deve continuar acessível com player aberto.

- Teclado completo (Tab/Shift+Tab/Enter/Espaço/Escape e setas em tabs/menu), skip link, ordem/foco no erro/retorno do modal; leitor de tela para labels/status e teste automático de acessibilidade seguido de inspeção real. Contraste AA em ambos os temas, inclusive foco/bordas/disabled legível; legendas e alternativa textual quando disponíveis para a aula real.
- Duas contas com temas diferentes e estados distintos: nenhuma herança de tema/dados/rascunhos; autor versus outro membro; moderador versus suporte/admin; acesso expirado durante a aula, voto repetido, denúncia sem ocultação automática, edição em revisão e logout/back sem conteúdo protegido.
- Fluxos: deep link → login → onboarding → aula; materiais bloqueados/baixáveis; curso concluído → certificado verificável; ticket/resposta/reabertura; post → moderação humana → visibilidade; checkout local pendente/confirmado/expirado/duplicado sem dinheiro real. Testar zero/um/muitos itens e provedores ausentes.
- Vitest/Testing Library para estados/ações e Playwright para os fluxos críticos, teclado, screenshots responsivas e ausência de reload em mutações. Validar build/TS e contratos dos adapters localmente antes de CI; não usar GitHub como diagnóstico. Meta PRD de LCP <2,5s em 4G é meta a medir, não resultado desta análise; lazy-load player/admin e evitar payload de fases futuras.
- No novo inventário de telas, relacionar cada fluxo à ajuda passo a passo e ao tour aplicável exigidos pelo projeto. Reaproveitar mecanismo escolhido para o novo stack; não transportar engine Vue ou criar segundo motor nesta análise. Seletores visíveis, permissão e mobile exigem validação integrada antes de alegar conclusão de tour/artigo.

## Recomendação mínima de PRODUCT.md / DESIGN.md (não escritos)

**PRODUCT.md:** marcador `impeccable:product-schema 1`, Platform `web`, Stack React/TS/Vite, alunos/admin/moderação/suporte, objetivo entregar curso com progresso/materiais/certificado e comunidade moderada, uma organização por instalação, escopo/exclusões desta análise, fornecedores ainda sem conta e modo local sem cobrança. Registrar identidade Icarus já definida, preferência por usuário com claro inicial e decisões ainda abertas de oferta/acesso/conteúdo real. Não copiar persona SaaS da referência como público confirmado, valores da arr.academy ou metas como resultados.

**DESIGN.md:** autoridade e caminhos do DS/guia, marca versus propostas de interface, tabela dos tokens claro/escuro, Inter/licença, assinatura/proporções/mínimo e fallback compacto, escala/espaços/raios/layout, componentes pontuais e contratos de interação, estados e acessibilidade. Modo Operate e contrato por fluxo pertencem ao breve de superfície, sem transformar “Operate” em identidade de todo produto. Não reabrir escolha de mundo visual nem gravar preferência de comp-first.

## Evidência e limites

Lidos PRD integral, skills/referências de planejamento, fonte do DS, tokens, especificação e gerador; comparação byte a byte do SVG realizada. A URL pública `https://tiberiolemes.com.br/icarus/ds/` não pôde ser aberta pelo web tool; esta análise usa a fonte local oficial indicada no brief, sem afirmar inspeção visual atual da publicação. Não naveguei na arr.academy privada, não executei aplicação/build/testes/gerador, não usei Git/GitHub e não alterei repo, PRODUCT.md, DESIGN.md ou Obsidian. Único arquivo escrito: este relatório; nenhuma UI implementada e nenhuma validação visual alegada.

Memória consultada apenas como histórico: MEMORY.md linhas 210–230 e nota do projeto no Obsidian; decisões anteriores de Frappe/Cakto não sobrepõem o brief de recomeço React/Asaas. Propostas de rotas e componentes acima são recomendações, não implementação existente.
