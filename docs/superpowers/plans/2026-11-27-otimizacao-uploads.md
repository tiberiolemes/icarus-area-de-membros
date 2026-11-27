# Otimização automática de imagens e PDFs no envio: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** imagens e PDFs são otimizados no navegador antes do envio, e servidor e banco recusam imagem acima de 500 KB e PDF acima de 5 MB (print do feedback: 5 MB).

**Architecture:** um módulo `src/optimize.ts` com `optimizeFile(file)` que nunca falha (devolve o original em qualquer erro ou quando não reduz). `Upload` e o formulário de feedback chamam esse módulo antes de enviar. Limites em três camadas: tela, `supabase/functions/upload` e `app_upload_access`.

**Tech Stack:** React 19, Vite 8, Vitest/jsdom, Deno (testes da função), Postgres/Supabase, `@neslinesli93/qpdf-wasm@0.3.1`.

**Spec:** `docs/superpowers/specs/2026-11-27-otimizacao-uploads-design.md`

## Global Constraints

- Imagem (PNG, JPG, WebP): até 500 KB = `512000` bytes. PDF: até 5 MB = `5242880` bytes. Print do feedback: até `5242880` bytes, ainda otimizado.
- MP4, ZIP, MP3, TXT, logo/ícone/assinatura e foto de perfil não mudam.
- Imagem: WebP qualidade `0.9`, mesmas dimensões, sem pintar fundo (preserva transparência). Animada (APNG ou WebP animado): sem otimizar.
- PDF: `qpdf --object-streams=generate --compress-streams=y --recompress-flate --compression-level=9`. PDF com `/ByteRange` (assinado) ou `/Encrypt`: sem otimizar. Só código de saída `0` conta como sucesso.
- Resultado só substitui o original se for estritamente menor. Qualquer exceção devolve o original.
- qpdf é carregado por `import()` dinâmico, nunca no bundle inicial.
- Português brasileiro, sem travessão como separador, sentence case. Dependência com versão exata.
- Migration nova recria `app_upload_access` a partir de `supabase/migrations/202611260010_security_retention.sql:208-234` e repete o `revoke`/`grant` dessa versão.

## Review Focus

- CSP de produção sem `'wasm-unsafe-eval'` faz o qpdf falhar: o envio precisa seguir com o original (teste na Task 1) e a CSP documentada ganha `'wasm-unsafe-eval'` (Task 4).
- JPG já bem comprimido fica maior em WebP: precisa ir o original (teste na Task 1).
- Navegador que não codifica WebP devolve PNG no `toBlob`: precisa ir o original (teste na Task 1).
- Nome com vários pontos e extensão maiúscula (`capa.final.PNG`) vira `capa.final.webp`, senão o servidor recusa por extensão (teste na Task 1).
- Cancelar durante "Otimizando arquivo…" não pode enviar nada (teste na Task 2).

---

### Task 1: módulo de otimização

**Files:**
- Create: `src/optimize.ts`
- Create: `src/optimize.test.ts`
- Modify: `package.json`, `package-lock.json` (dependência `"@neslinesli93/qpdf-wasm": "0.3.1"`)
- Modify: `THIRD_PARTY_NOTICES.md` (qpdf-wasm, ISC; qpdf, Apache-2.0)

**Interfaces:**
- Produces: `export async function optimizeFile(file: File): Promise<File>`; `export const limits = { image: 512000, pdf: 5242880, screenshot: 5242880 }`; `export function overLimit(file: File): string | null` (mensagem de recusa ou `null`; imagem acima de `limits.image` → `"A imagem passa de 500 KB. Escolha uma menor, em PNG, JPG ou WebP."`, PDF acima de `limits.pdf` → `"O PDF passa de 5 MB. Escolha um arquivo menor."`, outros tipos → `null`).

- [ ] **Step 1: Instalar a dependência** com `npm install --save-exact @neslinesli93/qpdf-wasm@0.3.1`.
- [ ] **Step 2: Escrever os testes que falham** em `src/optimize.test.ts`, com `createImageBitmap` e `HTMLCanvasElement.prototype.toBlob` simulados e `vi.mock("@neslinesli93/qpdf-wasm")`:
  - `"regrava PNG em WebP menor e troca a extensão"`: `capa.final.PNG` de 400 KB, `toBlob` devolve WebP de 100 KB → resultado `name === "capa.final.webp"`, `type === "image/webp"`, `size === 100*1024`; `toBlob` chamado com `("image/webp", 0.9)`.
  - `"mantém o original quando o WebP fica maior"`: WebP de 500 KB para JPG de 300 KB → `result === original`.
  - `"mantém o original quando o navegador não gera WebP"`: `toBlob` devolve `type: "image/png"` → `result === original`.
  - `"não mexe em PNG animado nem em WebP animado"`: bytes com chunk `acTL` e com `ANIM` → `result === original` e `createImageBitmap` não chamado.
  - `"comprime PDF sem perda com qpdf"`: mock de `callMain` grava saída menor e devolve `0` → resultado menor, `type === "application/pdf"`, mesmo nome; argumentos iguais aos de Global Constraints.
  - `"não toca PDF assinado nem criptografado"`: bytes com `/ByteRange` e com `/Encrypt` → original, qpdf não carregado.
  - `"envia o original quando o qpdf falha"`: `import` rejeita (simula CSP) e `callMain` devolve `2` → original nos dois casos.
  - `"outros tipos passam direto"`: `text/plain` → original.
  - `"overLimit aplica 500 KB para imagem e 5 MB para PDF"`: `512000` → `null`, `512001` → mensagem de imagem; `5242880` → `null`, `5242881` → mensagem de PDF; ZIP de 100 MB → `null`.
- [ ] **Step 3: Rodar e ver falhar:** `npx vitest run src/optimize.test.ts`. Esperado: FAIL, módulo inexistente.
- [ ] **Step 4: Implementar `src/optimize.ts`.** Imagem por `createImageBitmap` + `<canvas>` + `toBlob`. Animação: procurar `acTL` (PNG) ou `ANIM` (WebP) nos bytes. PDF: ler bytes em latin1 para a checagem de `/ByteRange` e `/Encrypt`; carregar `import("@neslinesli93/qpdf-wasm")` e a URL do WASM por `import("@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url")`, `createModule({ locateFile: () => wasmUrl, noInitialRun: true })`, `FS.writeFile("/in.pdf")`, `callMain([...])`, `FS.readFile("/out.pdf")`. Tudo dentro de um `try` que devolve o original.
- [ ] **Step 5: Rodar e ver passar:** `npx vitest run src/optimize.test.ts`. Esperado: PASS. Depois `npm run typecheck` e `npm run build`, sem erro; o `qpdf.wasm` e o `qpdf.js` aparecem como chunks separados em `dist/assets`, fora do `index-*.js`.
- [ ] **Step 6: Commit:** `git add src/optimize.ts src/optimize.test.ts package.json package-lock.json THIRD_PARTY_NOTICES.md && git commit -m "feat: otimiza imagens e PDFs no navegador antes do envio"`

### Task 2: telas de envio usam a otimização e os novos limites

**Files:**
- Modify: `src/upload.tsx`
- Modify: `src/upload.test.tsx`
- Modify: `src/pages/feedback.tsx`
- Test: `src/upload.test.tsx`, teste de feedback existente (procurar `feedback` em `src/**/*.test.tsx`)

**Interfaces:**
- Consumes: `optimizeFile`, `overLimit`, `limits` de `src/optimize.ts`.

- [ ] **Step 1: Escrever os testes que falham** em `src/upload.test.tsx`, com `vi.mock("./optimize")` mantendo `overLimit` e `limits` reais:
  - `"capa é otimizada antes do envio e o envio leva o arquivo otimizado"`: `optimizeFile` devolve `capa.webp`; o `FormData` enviado ao `invoke` tem `file.name === "capa.webp"`; durante a espera aparece o status `"Otimizando arquivo…"`.
  - `"mostra quanto o arquivo diminuiu"`: original 400 KB, otimizado 100 KB → status `"Arquivo otimizado de 400 KB para 100 KB e enviado."`; sem redução → `"Arquivo enviado e associado ao registro."` (texto atual).
  - `"recusa PDF de material acima de 5 MB antes de enviar"`: PDF de `5242881` bytes → mensagem de `overLimit`, input limpo, nada enviado.
  - `"recusa imagem de post acima de 500 KB"`: igual, kind `post-image`.
  - `"cancelar durante a otimização não envia nada"`: `optimizeFile` pendente, clicar em `"Cancelar envio"`, resolver → `invoke` e reserva não chamados.
  - `"foto de perfil e vídeo da aula não passam pela otimização"`: `optimizeFile` não chamado para `avatar` e `lesson`.
  - Ajustar os testes existentes cujos textos de dica mudam (Step 3).
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/upload.test.tsx`.
- [ ] **Step 3: Implementar em `src/upload.tsx`.**
  - No `onChange`, trocar a checagem fixa da capa por `overLimit(selected)` para todos os kinds exceto `avatar` (que mantém a dele).
  - Em `upload()`, para kinds diferentes de `avatar` e `lesson`: `setState("Otimizando arquivo…")`, `selected = await optimizeFile(selected)`, conferir `controller.current.signal.aborted` (lança `"Envio cancelado."`), depois `setState("Enviando arquivo…")`.
  - Mensagem final com redução, em KB inteiros arredondados.
  - Dicas: material → `"PDF até 5 MB, otimizado automaticamente. ZIP, MP3 e TXT até 500 MiB. O andamento abaixo não estima percentual."`; capa → `"PNG, JPG ou WebP de até 500 KB, otimizado automaticamente. O ideal é 1600 × 900 px."`; padrão → `"Imagem PNG, JPG ou WebP até 500 KB e PDF até 5 MB, otimizados automaticamente. Outros anexos até 20 MiB."`
- [ ] **Step 4: Teste de feedback que falha:** `"o print é otimizado antes do envio e o limite segue 5 MiB"`: `optimizeFile` devolve `print.webp`, o `FormData` leva `print.webp`; print de `5242881` bytes continua recusado com a mensagem atual.
- [ ] **Step 5: Implementar em `src/pages/feedback.tsx`:** `upload.set("file", await optimizeFile(original.file))`. Limite de 5 MiB inalterado.
- [ ] **Step 6: Rodar e ver passar:** `npx vitest run src/upload.test.tsx` e o teste de feedback; depois `npm test`. Esperado: tudo PASS.
- [ ] **Step 7: Commit:** `git add src/upload.tsx src/upload.test.tsx src/pages/feedback.tsx <teste de feedback> && git commit -m "feat: telas de envio otimizam arquivos e aplicam os novos limites"`

### Task 3: servidor e banco recusam acima dos limites

**Files:**
- Modify: `supabase/functions/_shared/files.ts:1-6` (`png`, `jpg`, `jpeg`, `webp` → `512000`; `pdf` → `5242880`)
- Modify: `supabase/functions/upload/index.ts`
- Create: `supabase/migrations/202611270001_upload_limits.sql`
- Create: `supabase/tests/upload_limits.sql`
- Modify: `tests/integration/edge_test.ts`, `tests/integration/feedback_edge_test.ts`

**Interfaces:**
- Consumes: nada das tasks anteriores (limites repetidos de propósito: o servidor não confia no cliente).

- [ ] **Step 1: Testes Deno que falham:**
  - `edge_test.ts`: `"multipart recusa imagem acima de 500 KB e PDF acima de 5 MB"` (post-image PNG de `512001` → 422; ticket-attachment PDF de `5242881` → 422; PDF de `5242880` passa da validação de tamanho). `"reserva de material recusa PDF acima de 5 MB"` (`action: "reserve"`, `size_bytes: 5242881` → 422, `5242880` → 200).
  - `feedback_edge_test.ts`: `"print de feedback aceita até 5 MB"` (PNG de `5242880` passa da validação de tamanho; `5242881` → 422).
- [ ] **Step 2: Rodar e ver falhar:** `node scripts/test-integrations.mjs`.
- [ ] **Step 3: Implementar.** Em `files.ts`, os novos `max`. Em `upload/index.ts`, o limite do multipart vira `screenshot ? 5242880 : Math.min(format.max, 20 * 1024 * 1024)`, e a mensagem de recusa por tamanho vira `"Imagens aceitam até 500 KB e PDFs até 5 MB."` quando o tipo é imagem ou PDF (mantém `"Tipo ou tamanho de arquivo não permitido."` para o resto).
- [ ] **Step 4: Rodar e ver passar:** `node scripts/test-integrations.mjs`. Esperado: PASS.
- [ ] **Step 5: Teste SQL que falha** em `supabase/tests/upload_limits.sql` (modelo: `supabase/tests/course_cover_focus.sql`, com `begin;` e `rollback;`): admin reserva `course-cover` JPG de `512000` (passa) e `512001` (negado); `material` PDF de `5242880` (passa) e `5242881` (negado); `material` ZIP de `104857600` (passa); `post-image` WebP de `512001` (negado); `ticket-attachment` PDF de `5242881` (negado); membro sem permissão continua negado; `has_function_privilege('authenticated', ...)` continua falso.
- [ ] **Step 6: Migration** `202611270001_upload_limits.sql`: `create or replace` de `public.app_upload_access` igual à versão atual, com uma checagem logo após a de tipo: imagem acima de `512000` ou `application/pdf` acima de `5242880` → `app_private.fail('Imagens aceitam até 500 KB e PDFs até 5 MB.')`. Remover os tetos antigos de `10485760` que ficam redundantes. Repetir `revoke` e `grant`.
- [ ] **Step 7: Rodar e ver passar:** `npm run test:db` (banco local descartável; ver memória `reference_banco_descartavel_para_testar_migration_do_icarus`). Esperado: todos os arquivos com saída `0`.
- [ ] **Step 8: Commit:** `git add supabase/ tests/integration/ && git commit -m "feat: servidor recusa imagem acima de 500 KB e PDF acima de 5 MB"`

### Task 4: ajuda, operação e versão

**Files:**
- Modify: `src/pages/help-articles-team.ts` (capa nas linhas ~204 e ~277; artigo de materiais; anexo de suporte)
- Modify: `src/pages/help-articles-member.ts` (imagem de post, anexo, print)
- Modify: `docs/operations.md:218` (`script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com`, com uma frase explicando que o qpdf usa WebAssembly)
- Modify: `CHANGELOG.md`, `package.json` (seguir o padrão da 2.11.0: minor `2.12.0`)

- [ ] **Step 1:** atualizar os textos de ajuda com os limites e a frase "o arquivo é otimizado automaticamente no envio, sem perda visível". Troubleshooting da capa: tirar "exporte em JPG ou WebP" como saída para arquivo grande; manter a orientação de reduzir para 500 KB.
- [ ] **Step 2:** CSP em `docs/operations.md` e entrada no `CHANGELOG.md`.
- [ ] **Step 3: Verificar:** `npm test`, `npm run typecheck`, `npm run build`. Esperado: PASS.
- [ ] **Step 4: Verificação no navegador real** (`npm run local:start` + `npm run dev`): enviar capa PNG de cerca de 400 KB, PDF de material de cerca de 4 MB, imagem de post e print de feedback; conferir no Storage local o tamanho menor e a extensão `.webp`; abrir a capa e baixar o PDF; capturas em 360 px e nos dois temas; recusa de PDF de 6 MB e de imagem de 600 KB com a mensagem certa.
- [ ] **Step 5: Commit:** `git add src/pages/help-articles-*.ts docs/operations.md CHANGELOG.md package.json package-lock.json && git commit -m "docs: ajuda e operação com os novos limites de envio"`
