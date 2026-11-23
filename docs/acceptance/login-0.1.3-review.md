# Revisão independente — links de login 0.1.3

**Sem defeito demonstrável no recorte.** Base `c72edfecf87d6911ddeee896e078196cc7567cec`; alterações Root não commitadas, vinculadas aos SHA256 do JSON acompanhante.

- **Layout por fonte:** Recuperação está após o Password dentro de login-password e alinhada à direita em login-recovery. Footer mostra Ainda não tem conta? e Criar conta. Links usam text-action existente com alvo mínimo44px; nenhum token/paleta novo.

- **Confirmação contextual:** needsConfirmation inicia false, é limpo no novo envio e na edição de email; só fica true após error.code=email_not_confirmed do signInWithPassword nativo. Credenciais inválidas não sugerem confirmação. Nenhum lookup de existência ou auth.resend é disparado por essa decisão; resend continua só no Form explícito de confirmação. Referências: `src/pages/access.tsx:196`, `src/pages/access.tsx:201`, `src/pages/access.tsx:261`, `src/pages/access.tsx:297`.

- **AJAX/MFA/returnTo:** Mesmo Form e handlers signInWithPassword/challengeAndVerify preservados. Nenhuma navegação ao conteúdo é adicionada antes de assurance suficiente. Cadastro/recuperação/confirmação mantêm target sanitizado/encodeURIComponent e volta ao login com returnTo. Finalmente limpa senha/código no DOM, sem persistir novo contexto sensível.

- **SDK instalado e fixture:** SDK define X-Supabase-Api-Version=2024-01-01 na requisição e interpreta data.code quando a versão da resposta é>=2024-01-01; sem isso procura o legado error_code. Acrescentar header2024-01-01 à resposta sintética corresponde ao contrato instalado, sem trocar SDK por mock de alto nível ou relaxar asserções. Referências: `node_modules/@supabase/auth-js/src/lib/fetch.ts:102`, `node_modules/@supabase/auth-js/src/lib/fetch.ts:186`, `node_modules/@supabase/auth-js/src/lib/helpers.ts:515`, `node_modules/@supabase/auth-js/src/lib/error-codes.ts:48`.

- **Testes e ajuda:** Regressões de confirmação verificam estado inicial ausente, resposta nativa, erro inline, email preservado/senha limpa, ausência de resend automático, retorno contextual, invalid_credentials sem sugestão e limpeza ao alterar email. Ajuda descreve confirmação somente quando login indicar pendência. Casos anteriores de MFA/cancelamento permanecem.

- **Autoridade e pacote:** Diff se restringe a quatro arquivos UI/teste/ajuda/CSS e versão package/lock0.1.3. Nenhum auth gate, SQL/Edge/grant/permissão/provedor/dependência foi alterado.

## Verificação e limites

- `git diff --check`: exit0. Não repeti suítes.
- Os41 testes e build0.1.3 verdes são evidência informada pelo Root, não nova execução deste reviewer.
- A fixture com header corrigido é coerente com o SDK instalado; o primeiro resultado sem header não foi convertido em prova de que `error.code` funcionava naquela fixture.
- Root conduz seis capturas e Auth nativo sintético; não usei navegador, runtime, recibos privados ou capturas como prova própria.
- Sem fonte/DB/build/runtime/segredos/publicação alterados. Revisão estritamente delimitada; nenhuma aprovação global de todas as telas inferida.

## SHA256

- `src/pages/access.tsx`: `44485b54d600214085a575c8077e9bcb060b7da72fe6c39458a2adb1b47a6212`
- `src/style.css`: `62a27909e874e106cb8f86eb1c4b14408b55363064cc8a0814d64f063b63ad3f`
- `src/pages/help.tsx`: `5c87550d2141255ce8bde60c386dab6d8e1829021e79e6d5946fddf7b2ec3522`
- `src/login.test.tsx`: `13183bd7d3c02b80194a65517ab5c94f644e7586b48b8e081bc18eb569e3e64d`
- `src/api.ts`: `8c46eaeb77c10796cbbc1cc54267e873cd6affe417566f76fab98b1f0982f74f`
- `package.json`: `4f3fa6f0dc9a0c953162f7cd26e3f4e4f74dd16043257278cacdf7361717c923`
- `package-lock.json`: `d38518f5c4865394a0eaa931f28d60fe86a7ea4d3e05693bc81c539c52fc8675`
- `node_modules/@supabase/auth-js/src/lib/fetch.ts`: `3fe0a5c08d6a8a62611ba196042b640457e844711644df9e69601af8e6c64acf`
- `node_modules/@supabase/auth-js/src/lib/helpers.ts`: `82025113a07125f319380ec5a510e58544a04f6e3bcf82c6eb8ce3a2cc6b07c5`
- `node_modules/@supabase/auth-js/src/lib/constants.ts`: `2beb8ae7ea6ae2ca21bd3c68eb8fcc5af0e84fdbbebfade1d7cf34b9b96ee9cd`
- `node_modules/@supabase/auth-js/src/lib/error-codes.ts`: `883b47542158649f913f9c8ce39d89477aee575d5cd1b51eb17ddea5e820a3db`
