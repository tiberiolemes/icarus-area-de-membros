# Complemento focado — L1 resolvido

**L1 resolvido; nenhum novo defeito demonstrável neste complemento.** Base `8c11ad2a26be6e53657f90ecebbc5f44311ae7d3`, snapshot de trabalho Root ainda não commitado; SHA256 dos 10 arquivos no JSON acompanhante.

- **Links:** cadastro, recuperação, confirmação e Voltar para entrar propagam `encodeURIComponent(target)` sanitizado; a navegação preserva o destino contextual. Referências: `src/pages/access.tsx:186`, `:187`, `:188`, `:395`.
- **Teste dirigido executado:** `npx vitest run src/login.test.tsx` — **6 aprovados, 0 falhas**. Três regressões de ida/volta, mais três do login/desafio/cancelamento.
- **Submit:** a guarda `lock.current || disabled` em `src/ui.tsx:201` impede envio durante carregamento de sessão/assurance; não depende só de desabilitar o botão.
- **Tema:** `index.html:2` inicia light; `src/shell.tsx:49` mantém preferência por usuário. Sem troca de tokens/paleta.
- **MFA/primeiro admin:** nenhuma ampliação de grants; migration19 continua alterando só o helper privado. Promoção permanece privilegiada por ID específico, email e primeira senha, com MFA opcional conforme decisão explícita.
- **Fixtures:** backend/followup só acrescentam fator verificado para preservar negativas AAL1; não afrouxam asserções.

## Provas informadas pelo Root, sem reexecução aqui

- 37 frontend totais e35 contratos aprovados.
- SQL17+109+36+16+45+25 e corrida4 aprovados.
- QA nativa: sem fator SQL/Edge200, fator verificado AAL1 SQL negado/Edge403 e AAL2 SQL/Edge200.
- Navegador nativo: senha→código na mesma Form/documento e /entrar; após Enter, /admin/cursos no mesmo documento.
- Root verificou capturas1280/360 em light e fará dark; alteração do tema salvo das contas demo foi feita pelo Root via app_profile nativo, não por este reviewer.

## Limites

- Não li .local/env, segredo ou recibo privado; não alterei fonte/DB/runtime e não publiquei.
- Sem controle de navegador ou análise direta das capturas Root; aceite visual dos dois temas pertence à verificação do Root.
- Não repeti suítes completas ou provas nativas sem mudança que as justificasse.
- Veredito restrito a este complemento e aos hashes registrados, sem nova auditoria de produto.

A correção de L1 pode encerrar esta revisão dirigida; nenhuma nova rodada ampla foi justificada.


## Adendo final 0.1.1 — limpeza de cache no Login

**Sem defeito novo demonstrável neste adendo.** Os dois `cache.clear()` foram retirados do Login; o corpo de `AuthProvider` é idêntico à base `8c11ad2` e mantém a limpeza quando a identidade muda. A retirada não concede acesso: SDK/desafio nativos, Gate/SessionGate/AccountAssurance e autoridades SQL/Edge permanecem.

O teste de Login agora monta o destino dentro do Gate real e fornece bootstrap/touch por transporte controlado, aguardando o h1 autorizado. Não executei nova suíte neste adendo. Pacote `0.1.1`, dependências e devDependencies sem mudanças.

O Root registrou a primeira observação sem conteúdo até reload como falha, e relatou repetição ponta a ponta com conteúdo visível no mesmo documento após o build sem os clears. Isso está alinhado ao aceite `docs/acceptance/login-0.1.1.md`; não é prova nativa reexecutada por este reviewer nem diagnóstico causal retrospectivo independente.

SHA256 atuais dos cinco arquivos do adendo estão em `cache_clear_addendum_0_1_1.files_sha256` no JSON. Nenhuma fonte, DB, runtime, segredo ou publicação foi tocado.
