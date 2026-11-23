# Revisão focada — login e MFA opcional

**Um defeito P2 de navegação; nenhum defeito adicional demonstrado nos gates do delta.** Base `8c11ad2a26be6e53657f90ecebbc5f44311ae7d3`, alterações Root ainda não commitadas. SHA256 dos 20 arquivos no JSON acompanhante.

## L1 · P2 · Links auxiliares descartam o returnTo do login

Local: `src/pages/access.tsx:187`; conectado a `src/pages/access.tsx:395` e cálculo de target com `internalPath`.

**Cenário:** Aluno abre /entrar?returnTo=/app/cursos/curso/modulo/aula e clica Criar uma conta: o href novo é somente /cadastro, e o formulário passa a calcular target=/app/cursos. Outro caminho: Esqueci minha senha preserva o parâmetro ao ir para /recuperar, mas Voltar para entrar agora aponta a /entrar sem parâmetro.

**Causa/impacto:** O refactor substitui links que propagavam encodeURIComponent(target) por rotas fixas de cadastro e retorno. internalPath(null) usa o catálogo como fallback. Após cadastrar/confirmar email ou simplesmente voltar e autenticar com senha/MFA, o usuário chega ao catálogo em vez da aula/rota interna que iniciou o login. Não altera permissões, mas quebra o retorno contextual pedido e existente antes do delta.

**Prova:** Inspeção literal do diff e dos consumidores: cadastro monta emailRedirectTo a partir do target perdido; Login navega ao target após AAL suficiente. Os testes atuais de returnTo cobrem somente entrada/desafio direto, não ida/volta pelos links auxiliares.

**Correção mínima:** Propagar o target sanitizado nos links Criar uma conta e Voltar para entrar, mantendo encodeURIComponent; preservar a mesma regra nos links auxiliares afetados sem permitir destino externo.

**Aceite:** Em login com deep link, cadastro mantém returnTo no endereço/callback; ir para recuperação e voltar conserva returnTo; login com/sem fator finaliza no destino original. returnTo externo continua recusado.

## Fluxos conectados conferidos

- **Login de senha e desafio:** Usa signInWithPassword e challengeAndVerify nativos. Mantém uma instância Form, preserva endereço enquanto exige código, escolhe fator TOTP verificado, foca input e não navega ao conteúdo antes do sucesso/assurance suficiente. Código inválido limpa o código e permite repetir sem reenviar senha; cancelar encerra sessão incompleta pelo helper signOut.
- **MFA opcional e autoridade:** 019 altera só app_private.requires_aal2 e revoga execução de PUBLIC/anon/authenticated. Actor/service_session de016 continuam exigindo simultaneamente JWT/header aal2 e auth.sessions.aal=aal2 quando esse helper encontra fator verificado. Sem fator, AAL1 permite qualquer papel, conforme nova decisão. Role/ownership e demais grants não foram ampliados na migration19.
- **Edge e primeiro admin:** actor e reauthenticate exigem AAL2 somente quando Auth informa fator verificado; service helper SQL permanece a segunda fronteira. Primeiro admin mantém ID explícito/conta legítima/email confirmado/primeira senha e remove apenas o pré-requisito de MFA, sem RPC pública de promoção.
- **Assurance e mensagens do Form:** AccountAssurance verifica o nível e redireciona a /entrar com returnTo sanitizado pelo consumidor. Form aceita disabled para bloquear controles durante consulta e successMessage vazio suprime sucesso enganoso no login.
- **Layout por fonte:** Painel .access max-width480px, padding32px, borda1px tokenic-border, radius12px e superfície tokenic-surface; mobile padding24px vertical/20px horizontal. Ordem título→credenciais/código→ação inteira→apoio. Família Inter e tokens existentes reaproveitados. Sem comparação visual com captura original, não atesto fidelidade visual/360px/temas.
- **Ajuda/documentação e dados de teste:** Ajuda/tour/docs/API/operação descrevem segundo fator opcional e desafio no mesmo login. Testes usam marcadores sintéticos; não observei senha real/token operacional/OTP real embutido nos deltas lidos. Nenhum arquivo .local/env foi lido.

## Testes e limites

- `npx vitest run src/login.test.tsx src/frontend.test.tsx`: **21 passed, 0 failed**. SDK real com fetch sintético + componentes; mesma Form, foco, código inválido/retry/cancel, AAL1 sem fator, retorno direto.
- `node scripts/test-integrations.mjs`: **35 passed, 0 failed**. transporte simulado; inclui reauth member/admin sem fator e rejeição de staff com fator verified em AAL1.

- Não executados: SQL/DB/migration19 ou remoção de fator; Native/UAT e build em execução pelo Root; navegador/captura visual original ou controle do browser do Root; leitura de .local/env/segredos; publicação ou alteração de fonte/runtime.
- QA migration19 + optional_mfa25 + mfa_outbox45 verdes, não reexecutados por este reviewer. Remoção de fator do admin demo via AuthAdmin nativo é alteração operacional informada pelo Root, não verificada diretamente aqui.
- Captura original não disponível a este worker; layout avaliado só pela fonte. Root permanece responsável por UAT360/desktop/dois temas e prova nativa.
- Escrita restrita aos dois relatórios temporários; nenhum arquivo do projeto alterado.

Corrigir L1 e verificar só ida/volta dos links auxiliares; nenhum novo ciclo amplo ou reabertura de escopo demonstrado. Gates de segurança do delta sem defeito adicional demonstrável.
