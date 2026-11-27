# Limite depois da otimização: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a tela aceita originais até 20 MB e aplica 500 KB (imagem), 5 MB (PDF e print) ao arquivo otimizado.

**Spec:** `docs/superpowers/specs/2026-11-27-otimizacao-uploads-design.md`, seção "Revisão de 27/nov/2026".

## Global Constraints
- `limits = { image: 512000, pdf: 5242880, screenshot: 5242880, original: 20971520 }`.
- Imagem: lado maior até 2560 px; qualidades `[0.9, 0.85, 0.8]`, para no primeiro resultado dentro do limite; senão fica o menor.
- Mensagens: original `"O arquivo passa de 20 MB. Escolha um menor."`; depois de otimizar, imagem `"Mesmo otimizada, a imagem ficou com X KB. O limite é 500 KB."`, PDF `"Mesmo otimizado, o PDF ficou com X MB. O limite é 5 MB."`, print `"Mesmo otimizado, o print ficou com X MB. O limite é 5 MB."` (X com uma casa decimal em MB, inteiro em KB).
- Servidor e banco não mudam.

## Review Focus
- Imagem animada acima de 500 KB não é otimizada e precisa ser recusada depois, não enviada.
- Foto de perfil de 5 MB precisa abrir a prévia do recorte.
- Retentativa do print continua mandando os mesmos bytes.

### Task 1: `src/optimize.ts`
- Produces: `optimizeFile(file: File, max = limits.image): Promise<File>`, `overLimit(file: File): string | null` (só o teto de 20 MB do original, para imagem e PDF), `finalLimit(file: File, screenshot = false): string | null`.
- [ ] Testes em `src/optimize.test.ts`: redução a 2560 px; degraus de qualidade até caber; menor resultado quando nada cabe; `max` do print para no 0,9; mensagens de `overLimit` e `finalLimit`. Ver falhar, implementar, ver passar, commit.

### Task 2: telas
- `src/upload.tsx`: `overLimit` na escolha (inclusive avatar com 20 MB); `finalLimit` depois de `optimizeFile` (também para imagem de material); dicas novas. `src/pages/feedback.tsx`: original até 20 MB, `optimizeFile(file, limits.screenshot)` e `finalLimit(file, true)`. `src/pages/admin.tsx`: `"image/webp": "Imagem WebP"` em `materialTypes`.
- [ ] Testes em `src/upload.test.tsx` e `src/feedback.test.tsx` (capa de 1 MB aceita e otimizada; recusa após otimizar sem envio; original acima de 20 MB recusado; PDF de 6 MB que cai para 4 MB é enviado; imagem de material otimizada; avatar de 1 MB abre a prévia; print acima de 5 MB depois de otimizar é recusado). Ver falhar, implementar, ver passar, `npm test`, commit.

### Task 3: textos
- [ ] Ajuda (equipe e membro), `docs/CONTRACT.md`, `docs/api.md`, `CHANGELOG.md`. `npm test`, `npm run typecheck`, `npm run build`. Verificação no Chromium isolado com foto grande real. Commit.
