# Icarus — adaptações antes de implementar

23/11/2026. **Somente análise; nenhum aceite do Frappe reaproveitado.**

- Recomeço React + TypeScript + Vite, Supabase Postgres/Auth/Storage/RLS/Edge Functions e DS Icarus, com uma organização por instalação e sem código ou overlays Frappe.
- Entrega = Fase 1 + comunidade com moderação humana prévia; integrações preparadas e testáveis localmente, desligadas para cobrança real.
- Limpeza integral Frappe é pré-condição da implementação coordenada; este worker não remove arquivos nem executa runtime.

## O que falta no PRD

Ausente = requisito não especificado. Parcial = intenção presente, sem contrato suficiente para testar. Isto não é auditoria de uma aplicação nova já existente.

| Situação | IDs do padrão | PRD e adaptação mínima |
|---|---|---|
| ausente | FO-01..06, FO-17..18 | Formulários citados sem contrato de interação. **Adicionar:** SPA sem reload; loading e duplo clique; erro por campo/resumo/foco; preservar entrada em rede/401; rascunhos só de conteúdo seguro por usuário e limpar no logout. |
| parcial | SE-01..04, SE-07..10, SE-16..17 | RF-AC-09/CF-04 têm login/reset/confirmação; faltam força de senha, vazamentos, antienumeração, idle e 2FA. **Adicionar:** Política real do Auth refletida na UI, reset completo, limitação de tentativas, aviso 60 s e revogação; MFA completo para administração, sem declarar recuperação/dispositivo confiável se não implementados. |
| ausente | MO-01..05 | RF-AD-14/20 dizem excluir/suspender; audit_logs é só entidade. **Adicionar:** Confirmar destruição, arquivar/restaurar, reautenticar ação crítica no servidor e registrar ator/autorizador/alvo/motivo/data; histórico preservado. |
| parcial | LI-02..07, LI-09..11, BD-01 | Há busca/filtros localizados e feed paginado; sem padrão de listas/admin/export. **Adicionar:** Listas do escopo com paginação, busca/filtros/ordem úteis e contagem real; export administrativo quando necessário em Excel/CSV/PDF, conjunto filtrado completo, CSV sem fórmulas executáveis. |
| ausente | ON-03, ON-06 | RF-SP-06 é FAQ futuro, não tour nem central pública. **Adicionar:** Tour único e ajuda pública dos fluxos entregues, artigos alinhados à tela, feedback e acompanhamento por usuário/página; sem dimensões por empresa ou IA. |
| parcial | SG-02..05, SG-08..11, BD-04..06 | RNF-03 cita RLS; §6 cita função de acesso; não há grants/EXECUTE/ownership/revogação. **Adicionar:** RLS mais privilégios SQL, RPC fechada por padrão, identidade do token, teste real de papéis e dois usuários; URL não substitui autorização. |
| parcial | PR-04, PR-11..12, SG-16 | RF-AC-06 prevê webhook, RF-PL-04 expiração; sem idempotência/ordenação/estorno seguro. **Adicionar:** Checkout no servidor, evento único e transações, reconciliação, expiração/reembolso/chargeback/suspensão negam novas leituras e assinaturas. |
| parcial | FE-01..13, NA-04..05, NA-09..11, VI-01..11 | RNF-02/06 pedem responsividade/AA e RF-NV-07 URLs, sem estados/foco/recuperação completos. **Adicionar:** DS Icarus, vazio/loading/erro/bloqueio/retentativa, teclado/foco e 360/1920; sucesso só após persistência. |
| parcial | SG-12..13, CO-01..05, KP-06..08 | RNF-05 menciona LGPD; emails transacionais previstos; sem operação verificável. **Adicionar:** Consentimento versionado separado de marketing, minimização, export/exclusão com retenção justificada, emails com marca e teste de recebimento; exemplos rotulados. |
| parcial | EN-13, VE-01..05, VE-09..12, EN-01/03/07 | RNF-07/08 citam logs, 99,5% e backup diário/7 dias; faltam alerta de backup, ensaio restore e prova servida. **Adicionar:** Configuração operacional e evidências próprias; 99,5% exige janela mensal, backup exige execução/alarme/restore. Build/mock local não provam venda, envio, streaming ou deploy. |

## Inconsistências que precisam de adaptação

- **§6 versus §1/§9:** O campo preventivo `academy_id` contraria o escopo de uma organização por instalação. **Resolução:** Não incluir tenancy nem abstração por cliente.
- **RF-NV-04 versus VI-05:** PRD pede escuro padrão; regra pétrea pede claro. **Resolução:** Claro padrão; escuro opcional salvo por usuário; medir AA em ambos.
- **RF-CM-09/15, IA-06 versus decisão atual:** Título por IA e ocultação por contagem de denúncias contradizem ausência de IA e moderação manual. **Resolução:** Título digitado; post/resposta/edição entram pendentes até aprovação humana; denúncia abre fila, não condena nem bane automaticamente.
- **RNF-03:** Assinatura genérica de webhook não descreve o mecanismo do Asaas. **Resolução:** Validar authToken via asaas-access-token, não HMAC de Stripe; autenticação precede persistência/processamento.
- **§6, RF-CT-02:** 100% sobre aulas publicadas mistura requisitos, conteúdo privado inacessível e denominador zero; trigger genérico não assegura emissão válida. **Resolução:** Currículo obrigatório versionado, total > 0, conclusão autorizada de todos os requisitos e emissão no servidor; detalhado no contrato.
- **RF-CT-03 e rota observada:** Slug do curso não identifica certificado de cada aluno. **Resolução:** Código único opaco por emissão, URL pública por código; nunca listar alunos/certificados publicamente.
- **RF-AC-04/06:** Pix imediato pode parecer liberação no retorno do checkout; mesmo email não prova titularidade. **Resolução:** Somente pagamento confirmado e vinculação segura liberam; retorno exibe pendente até confirmação.
- **§9 e grupos RF:** Escopo original coloca comunidade na fase 2; melhorias Novo aparecem no meio do MVP; feed 45 versus RNF 20. **Resolução:** Decisão atual antecipa só comunidade básica; feed 20 por página; demais fases permanecem fora.
- **RF-PL-01, RF-AC-07, questões em aberto:** N planos, recorrência e nota fiscal inferida não definem oferta real nem configuração fiscal. **Resolução:** Community + oferta anual configurável no mínimo; sem copiar preços/benefícios; sem renovação automática ou emissão fiscal fingida. Validar capacidade fiscal/credenciais antes de vender.

## Menor entrega completa

**Aluno**

- Cadastro/login/reset/logout e confirmação de email; onboarding simples editável, perfil, tema e assinatura/validade.
- Catálogo, curso/módulo/seção/aula de vídeo, deep link, preview e bloqueio por plano; conclusão manual autorizada, progresso e Continuar.
- Pastas e materiais vinculados à aula com download autorizado; certificados emitidos/verificáveis e PDF baseado na emissão.
- Resumo de checkout próprio com Pix/cartão até limite configurado e estados pendente/pago/falhou/expirou; criação no servidor. Preferir pagamento hospedado Asaas para não trafegar cartão; adaptação explícita a RF-AC-04/05, não fingir checkout integral embutido.
- Tickets do titular com thread, anexo privado, status e reabertura; contato WhatsApp configurado sem prometer SLA sem equipe.
- Comunidade independente das aulas: espaços, título/corpo/imagem, post, resposta, voto único, denúncia, editar/arquivar próprio, feed recente paginado e filtro por espaço; publicação e edição dependem de aprovação manual.

**Admin**

- CRUD/publicação/arquivamento/restauração de curso, módulo, seção, aula e material; ordem simples com alternativa de teclado, preview e regras de acesso.
- Membros, papel e vigência/cortesia com motivo/auditoria; pedidos e eventos, estado fiscal honesto, reconciliação/reenvio seguro; plano/oferta anual configurável.
- Espaços/permissões, fila humana de posts/respostas/edições/denúncias, aprovar/rejeitar/ocultar/restaurar, suspensão com motivo; fila de tickets e anexos; auditoria paginada.
- Termos/privacidade versionados, configurações necessárias da marca Icarus e integrações via ambiente seguro; sem construtor genérico de plataforma. Tours/ajuda dos fluxos reais.

**Fora desta entrega**

- Ranking/pontos/prêmios/conquistas, diretório avançado e DM, podcasts, encontros/RSVP, IA/tutor/triagem/títulos, automações/n8n, push/WhatsApp automático, resumo semanal/campanhas.
- Notificações completas da fase 2 e suas preferências, feedback in-app, listas de espera, drip/pré-requisitos, quiz/tarefa, comentários por aula, auto-conclusão/autoplay/notas pessoais.
- Editor de questionário/segmentação, cupons/order bump, importação CSV, impersonação, analytics/funil sofisticado, editor de menu, N planos/renovação automática e multi-tenant. Não criar tabelas/SDKs/telas vazias para esses itens.

## Controles por grupos/IDs

Inventário real: **301 entradas = 294 vigentes (21 pétreas, 240 padrões, 33 preferências) + 7 PP não aprovadas**. Seleção por fluxo, não transformação de toda regra em feature; intervalos abaixo apontam IDs existentes no grupo. Preferências continuam preferências; itens condicionais só se o fluxo existir. A matriz antiga foi consultada apenas como localização, sem herdar “atende” ou provas.

| Grupo | IDs aplicáveis ou condicionais | Aplicação mínima |
|---|---|---|
| FO/FE | FO-01..10,12..18,20..23,25..26; FE-01..13 | Contrato reutilizável dos formulários existentes; FO-07 disponibilidade só no admin autorizado, sem enumerar emails/CPF no login público. CEP só se endereço fiscal exigido; sem cadastro auxiliar fictício. |
| SE | SE-01..10,14..17 | Auth completo; SE-06/MO-02 só ações críticas. SE-11 layout segue DS; SE-12 senha de página não cria auth paralelo; Google SE-13 posterior, PIN/app SE-18 fora. |
| LI/DT/KP | LI-01..11,13; DT-06,08..11,15; KP-01..08 | Listas/indicadores reais apenas; não construir calendário/período/comparativo/export em todo card. Importação LI-12 fica fora enquanto import não existir. |
| MO/SG/BD | MO-01..08; SG-01..16; BD-01..10,13 | Segurança/integridade adaptadas a titular/papel, não empresa. BD-11/12 condicionais a produção/massa; não executar agora. |
| NA/VI/IM/TX | NA-01..05,07..11; VI-01..15; IM-01..07; TX-01..10,12 | Qualidade das telas entregues, DS/brand reais, pt-BR; sem landing/site menu hover, TV ou conteúdo inventado. |
| ON/CO | ON-01..06; CO-01..05,07..08 | Tour/ajuda e mensagens transacionais; ON-08 trata instalador de catraca, não demanda instalador novo. Comunicados/notificações só se entregues, CO-10 exclusivo Fitius fora. |
| PR/IA | PR-02..07,11..12; IA-06 adaptada | Primeiro núcleo e cobrança desligada; moderação prévia humana substitui IA por decisão explícita. Demais IA e regra de multiempresa não entram. |
| PF/VE/EN/AG | PF-01..02,04..06; VE-01..12; EN-01,03..05,07..13; AG-02..11,14..17 | Processo/evidência, não backlog de features. Sem deploy/PR nesta tarefa; EN-06 apenas se recriar Compose/env_file; EN-08 impede implementadores concorrentes. Nenhuma delegação aqui. |
| SI/HT | SI-01..02,06,12; HT-05,07,09 | Só páginas públicas pertinentes, ajuda, DS e documento/PDF produzido; área interna noindex. Marketing, captação, blog, relatório HTML, Instagram e vídeo não entram por tabela; preço no checkout é necessário, sem aplicar SI-07 para escondê-lo. |
| PP | PP-01..07 | Propostas não aprovadas: nenhuma obrigação ou aceite derivado. Os 294 IDs vigentes não são 294 features nem conformidade já obtida. |

## Contrato mínimo de segurança

Premissa AppSec: backend é autoridade para identidade, titularidade, papéis, estado e liberação; falha ou dado ambíguo nega. Controles abaixo são contrato proposto, não implementação verificada.

1. Identidade = JWT validado + auth.uid(); planos/papéis/vigência em fonte autoritativa não editável pelo membro. Função por operação e titular por objeto: A não lê nem altera perfil privado, progresso, pedido, ticket, anexo ou rascunho de B. Catálogo vende metadados permitidos; conteúdo oculto/rascunho não vaza.

2. Cada tabela exposta: RLS habilitada e grants mínimos; anon sem acesso direto ao privado; authenticated sem DML genérico sensível. Funções públicas revogam EXECUTE de PUBLIC/anon e concedem só chamadores necessários. Preferir invoker; definer apenas justificada, search_path seguro, nomes qualificados, checagem interna e sem service_role no browser. Views/Storage obedecem a mesma fronteira.

3. Checkout Edge recebe oferta e dados mínimos, recalcula preço em centavos/validade/parcelas e cria pedido vinculado; nunca aceita preço, role, user_id ou status pago do cliente. Chave de tentativa única e tratamento de timeout evitam cobrança duplicada; não presumir suporte a header de idempotência não confirmado do provedor. Credenciais ausentes = indisponível, nunca pagamento simulado apresentado como real.

4. Webhook Asaas: token dedicado no header asaas-access-token validado antes de gravar; evento único por id; persistência durável antes do HTTP 200 e processamento transacional idempotente. Conferir pedido, gateway_id, valor, método e titular; estados fora de ordem não reativam estorno. Reconciliação consulta estado autoritativo em divergência; erro fica pendente/visível e permite reprocessar, sem liberar por otimismo.

5. Assinatura expirada/revogada, chargeback, estorno, suspensão e papel removido são verificados em cada consulta/RPC/emissão de URL; não confiar em UI/JWT antigo de papel. Cancelar renovação não deve cortar período já pago; reembolso retira o direito correspondente. Preservar progresso e certificados já emitidos, salvo revogação explícita justificada. Logout/idle invalidam sessão conforme capacidade validada, não apenas redirecionam.

6. Arquivo privado e anexo: bucket privado, tamanho/tipo/extensão e permissão no servidor, caminho gerado; links curtos após gate, nunca URL permanente ou só filtro de interface. Vídeo Bunny assinado no servidor e domínio autorizado; assinatura do embed não prova fechamento de downloads/originais/CDN. Revogação bloqueia novas URLs imediatamente; URLs já emitidas têm janela residual até expirar, sem prometer revogação instantânea de bearer URL.

7. Certificado: servidor verifica currículo obrigatório publicado/versionado, total > 0, todos os requisitos realmente concluídos com autorização, curso certificável e elegibilidade vigente na emissão. Preview gratuito 1/1 não certifica curso com 15 aulas obrigatórias; aulas privadas inacessíveis não viram concluídas nem reduzem artificialmente o total. Conteúdo opcional privado só fica fora se explicitamente opcional no currículo. Uma emissão por usuário/curso/versão, transação e código imprevisível.

8. Emissão guarda nome/curso/carga/data e versão curricular; verificação pública mínima por código, sem CPF/email nem listagem, com limite de abuso e estado de revogação. PDF no cliente só renderiza emissão recuperada do servidor; parâmetros locais não emitem certificado. Arquivar/restaurar curso/aula não inventa completed_at, progresso retroativo ou nova emissão; preservar eventos e retrato da emissão.

9. Comunidade: pendente -> aprovado/rejeitado, aprovação somente moderador/admin; edição de publicado entra em revisão e não expõe versão não aprovada. Autor vê pendências próprias, outro membro não; respostas/imagens seguem gate do espaço/plano e suspensão. Voto único por alvo, denúncia sem auto punição, motivo e auditoria em moderação; rich text sanitizado e rate limit servidor.

10. Suporte: membro só próprios tickets e anexos; suporte só atendimento permitido, moderador não ganha financeiro/tickets por acidente; admin separado. Reauth para papel/cortesia/suspensão/exclusão/reembolso; logs sem credenciais/cartão/conteúdo pessoal desnecessário. Consentimento e termos versionados; export/exclusão não apagam trilha fiscal obrigatória, nem expõem dados de terceiros.

O token dedicado e a persistência antes de responder estão na [documentação oficial Asaas](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook); a opção de [checkout hospedado](https://docs.asaas.com/docs/asaas-checkout) reduz o tráfego de dados de cartão pelo projeto, conforme [orientação PCI-DSS](https://docs.asaas.com/docs/pci-dss). [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [privilégios de funções](https://supabase.com/docs/guides/database/functions) são travas distintas. A [configuração oficial Bunny](https://docs.bunny.net/reference/videolibrarypublic_update) distingue tokens do player, referrers e caminhos de reprodução. O desenho de fluxo/idempotência/revogação acima é adaptação de engenharia, não declaração de homologação dos serviços.

## Aceite finito

Nenhum teste de produto foi executado nesta análise. P0 bloqueia aceite local por segurança/integridade; P1 completa o escopo, não é opcional.

| ID | Prioridade | Cenário/resultado exigido |
|---|---|---|
| A01 | P0 | RLS/grants/RPC/Storage com anon, membro A/B, suporte, moderador e admin: positivos e negativos em SQL/API reais locais; forjar owner/role/plan não altera privilégio; teste falha ao retirar proteção. |
| A02 | P0 | Preview/membro gratuito, Pro válido/expirado/suspenso, draft/hidden, mídia e material por URL direta: mesmo gate; URLs antigas só até TTL e novas negadas após revogação. |
| A03 | P0 | Checkout falso no cliente, token webhook ausente/errado, duplicação/concorrência, timeout, valor/titular divergentes, eventos reordenados, estorno/chargeback: zero cobrança duplicada simulada e nenhum acesso indevido; reprocessamento seguro. |
| A04 | P0 | Novo comprador e conta existente: webhook só concede ao titular verificado; nunca vincular por email fornecido na UI; estado pendente sobrevive retorno/callback e falha de convite tem recuperação. |
| A05 | P0 | Certificado com zero aulas, só previews, aula inacessível, incompleto, curso inelegível e dupla conclusão; todos negam emissão indevida. Conclusão válida emite uma vez, PDF usa registro e código verifica snapshot/revogação. |
| A06 | P0 | Arquivar e restaurar curso/aula/post mantém datas/histórico/progresso/certificado; cancelar não escreve; reauth errada e chamada direta não autorizada são negadas. |
| A07 | P0 | Post/resposta/edição/imagem pendente não aparece a B; moderador aprova/rejeita; revogar plano/espaço/suspender corta acesso; XSS, spam e voto duplicado bloqueados; denúncias não auto banem. |
| A08 | P0 | Ticket/thread/anexo de A não acessível por B nem papel indevido; suporte responde e reabre, auditoria não contém segredo; export/exclusão respeitam titularidade. |
| A09 | P1 | Cadastro/reset/email/logout, política de senha e consulta de vazamento sem exposição; antienumeração/rate limit; idle avisa e encerra; MFA administração exige segundo fator e comprova recuperação configurada. |
| A10 | P1 | Jornada aluno e admin no navegador: 360/1920, teclado/foco, AA nos dois temas, deep link e retorno; 401/422/500/offline preservam texto seguro, bloqueiam duplo envio e nunca dão falso sucesso. |
| A11 | P1 | Listas 0/1/21+ registros: paginação e busca/filtros/ordem/contadores; export completo autorizado sem fórmula CSV; progresso/Continuar e validade iguais em todas as telas. |
| A12 | P1 | Tour/ajuda de curso, checkout, certificado, suporte, comunidade/admin: alvos visíveis desktop/mobile, pausar/pular/concluir/avaliar por usuário; artigos acompanham telas e não concedem acesso acadêmico. |
| A13 | P1 | Migração do zero em Supabase local, fixtures sintéticas, lint/TypeScript/build e regressões de autorização/dinheiro/progresso; configuração ausente fecha checkout/streaming com mensagem útil, sem chamadas cobradas. |
| A14 | externo | Com credenciais futuras: Asaas Sandbox Pix/cartão/webhook/estorno/convite, Bunny reprodução e proteção efetiva, email recebido/aberto, Supabase remoto grants/RLS/Storage e notas fiscais homologadas; ainda não executado. |
| A15 | operacional | Antes de produção: prova do artefato servido, observabilidade/alertas, backup diário com retenção 7 dias e restore ensaiado; 99,5% só medido em janela mensal. Primeira venda e conclusão reais são gate posterior, não teste local. |

**Parada:** Suíte finita A01..A13 aprovada encerra a construção local; revisar somente falhas/mudanças reais, sem reauditar indefinidamente as 294 regras. A14/A15 ficam explicitamente pendentes até infraestrutura/credenciais/operação. Sem aprovação local falsa por mocks ou superusuário.

## Lacunas externas e limites

- Contas e credenciais Supabase/Asaas/Bunny e email inexistentes; sem validação externa nem primeira venda.
- Oferta/preços/conteúdo/assinatura/legendas/logo e termos definitivos precisam de insumos reais, não copiar a referência.
- Emissão fiscal, recorrência e cancelamento dependem da modalidade contratada e homologação; não presumir nota fiscal automática pelo gateway.
- LCP 2,5s 4G é meta a medir sob perfil e artefato definidos; uptime/SLA/backup não são comprováveis só com teste local.
- CI futuro: um PR coerente, testes locais antes; autenticação/dinheiro/RLS requerem cobertura ampla pertinente. Não estimar runner sem workflow real; nenhuma execução de CI nesta análise.

Fontes locais: PRD completo em `PRD fornecido pelo responsável`; padrão `inventário de padrões fornecido na análise`; matriz antiga `matriz histórica usada somente como localização` somente para localização. Contexto histórico de marca/decisões foi lido e subordinado ao dispatch atual; preços e stack históricos não foram tratados como vigentes.

Só foram produzidos este relatório e seu JSON. Não houve implementação, remoção Frappe, testes da aplicação, escrita no Git/DB/runtime/GitHub ou delegação.
