# Login e MFA opcional · 0.1.1

Decisões do titular em 23/11/2026 substituem a exigência inicial de MFA para equipe: segundo fator opcional, ativado pelo próprio usuário em Sua conta → Segurança; quando ativo, seu desafio permanece obrigatório no servidor. O fator criado nos testes para o administrador demo foi removido pela API Auth Admin nativa, somente nessa conta.

## Entrega

Login agrupado em painel de 480px, borda1px, raio12px, padding32px/24px móvel, Inter e tokens Icarus. Botão principal inteiro; email, senha, ação e links de apoio têm hierarquia única. O código troca os campos dentro do MESMO elemento form, sem nova página, com foco no código, erro inline, limpeza de senha/código e cancelamento explícito. Cadastro, recuperação e confirmação preservam returnTo, inclusive ao voltar ao login.

Tema claro no primeiro HTML, no padrão do banco e no fallback da interface. O usuário pode escolher e salvar escuro. A conta demo member tinha preferência escura persistida pelos testes anteriores; foi voltada para claro via app_profile nativo. Admin e demais demos já estavam claros. Não houve alteração silenciosa de contas externas.

## Verificação

- Typecheck/build e 37 testes frontend, incluindo seis casos de login/código/cancelamento/links com SDK e Gate reais sob transporte controlado.
- 35 testes de contratos Edge, identificados como transporte simulado.
- SQL: 248 assertions (17/109/36/16/45/25 por arquivo) e quatro casos separados com conexões concorrentes, todos em transações com rollback.
- Migration19 aplicada explicitamente no DB local e QA, sem reiniciar serviço e sem fabricar histórico. Altera app_private.requires_aal2 e conserva sua ACL fechada; nenhum novo RPC público ou grant.
- Auth nativo com conta QA exclusiva: admin sem fator acessou SQL e reauth HTTP200; depois de ativar fator, AAL1 foi negado em SQL e Edge403; AAL2 nativo foi aceito em ambos. Nenhuma cobrança ou provedor externo.
- Navegador nativo: senha → código manteve endereço /entrar, identidade do form e performance.timeOrigin. Enter com TOTP válido abriu /admin/cursos no mesmo documento, conteúdo visível e tema claro. UI não concede acesso sem verificação do servidor.
- Capturas 1280px e 360px abertas para inspeção; painel e controles sem overflow, campos16px e alvos44px. Claro inicial e variante escura conferidos; não é teste de toque físico. Impeccable context/layout/craft e detector aplicados ao login; único alerta mecânico foi Inter, mantida por ser fonte oficial obrigatória do DS.

A revisão independente identificou perda de returnTo em dois links; corrigidos com três regressões de ida/volta. [Revisão inicial](login-focused-review.md) e [recheck](login-focused-recheck.md) acompanham a entrega. Não há nova revisão global de todas as telas inferida desta correção.

Uma primeira observação do destino após MFA mostrou conteúdo ausente até reload. A limpeza redundante de cache após o evento nativo de autenticação foi retirada do Login; AuthProvider mantém a limpeza por identidade. O fluxo completo foi repetido com o build seguinte, aguardando conteúdo autorizado visível no mesmo documento; esta execução passou. A observação anterior não foi promovida como fluxo completo aprovado.

Limites externos e de operação da 0.1.0 permanecem em [release-0.1.0.md](release-0.1.0.md). Recibos, sementes TOTP e credenciais são privados em .local, nunca no Git.

A conta QA exclusiva, suas sessões e seu perfil foram removidos após o navegador. A primeira exclusão Auth isolada foi recusada pela FK restritiva de perfil; a limpeza fechou as sessões QA e removeu somente o perfil demo exato antes de repetir a API Auth. O administrador demo real passou por login de senha AAL1, listagem administrativa autorizada, zero fatores e tema claro.

A preferência de claro e a obrigação de revisar visualmente o resultado já estavam registradas no projeto. Entregar uma conta demo com escolha escura deixada pelo QA e deixar o login sem agrupamento foram falhas de execução dessas orientações, não motivo para criar nova regra global. A correção mantém o DS e a escolha explícita por usuário.
