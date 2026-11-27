# Otimização automática de imagens e PDFs no envio

## Intenção

Toda imagem e todo PDF enviados pela plataforma chegam ao Storage no menor tamanho possível, sem perda visível, sem o admin precisar fazer nada além de escolher o arquivo. Os tetos passam a ser rígidos: **imagem até 500 KB e PDF até 5 MB**. PDF de 500 MB nunca mais é aceito.

## Objetivos

- Otimizar automaticamente, antes do envio, capa de curso, imagem de post, imagem e PDF de anexo de suporte, e PDF de material.
- Recusar no navegador, na função `upload` e no banco (`app_upload_access`) qualquer imagem acima de 500 KB ou PDF acima de 5 MB.
- Mensagens e dicas das telas refletem os novos limites.

## Não objetivos

- Reprocessar arquivos que já estão no Storage.
- Mudar vídeo MP4, ZIP, MP3 e TXT: seguem com os limites atuais.
- Logo, ícone e assinatura (bucket `icarus-brand`): já têm regras e limite próprios.
- Foto de perfil: já é recortada e regravada em JPEG 512 px no navegador.

## Antiobjetivos

- Perder nitidez visível na imagem ou qualquer conteúdo do PDF (texto, links, formulários, imagens).
- Quebrar a assinatura digital de um PDF assinado.
- Envio falhar por causa da otimização: se ela falhar ou não reduzir o tamanho, vai o original.

## Abordagens consideradas

- **A. Navegador, antes do envio (escolhida por Tibério).** Imagens pelo canvas nativo; PDF por qpdf em WASM carregado sob demanda. Servidor valida tipo e limites. Limite: envio direto pela API, sem a tela, chega sem otimizar, mas dentro do teto.
- **B. Função `upload` no servidor.** Cobre a API, mas as Edge Functions têm cerca de 2 s de CPU; PDF de 5 MB ou imagem grande pode estourar e falhar o envio de forma intermitente. Exige WASM no Deno.
- **C. As duas.** Dobro de código e herda o risco de B.

## Como funciona

1. O admin escolhe o arquivo. Acima do teto (500 KB imagem, 5 MB PDF), a tela recusa na hora, com o motivo.
2. Ao clicar em Enviar, a tela mostra "Otimizando arquivo…" e:
   - **Imagem** (PNG, JPG, WebP): regrava em WebP de alta qualidade (0,9) com as mesmas dimensões, sem metadados. Transparência é preservada. Imagem animada (APNG ou WebP animado) é enviada como está.
   - **PDF**: qpdf com compressão sem perda (`--object-streams=generate --recompress-flate --compression-level=9`). PDF assinado (com `/ByteRange`) ou criptografado é enviado como está.
   - Só usa o resultado se ele for menor que o original; qualquer erro cai no original.
3. O nome do arquivo troca de extensão quando a imagem vira WebP (`capa.png` → `capa.webp`), porque o servidor deduz o tipo pela extensão.
4. O envio segue pelo caminho atual (multipart ou reserva + Storage + confirmação), sem mudança de contrato.

## Limites no servidor

- `supabase/functions/_shared/files.ts`: `pdf` 5 MB; `png`, `jpg`, `jpeg`, `webp` 500 KB.
- `supabase/functions/upload/index.ts`: mensagens de erro com os novos tetos.
- Nova migration recria `app_upload_access` (a partir da versão de `202611260010_security_retention.sql`) recusando `application/pdf` acima de 5 MB e imagem acima de 500 KB em qualquer tipo de envio, mantendo REVOKE/GRANT.

## Decisões

- Print do feedback (Tibério, 27/nov/2026): mantém o teto de 5 MB, mas é otimizado no navegador antes do envio como as demais imagens. A função e o banco aplicam 500 KB às outras imagens e 5 MB ao print.
- qpdf via `@neslinesli93/qpdf-wasm` (wrapper ISC, qpdf Apache 2.0, cerca de 1,3 MB), carregado só quando um PDF é enviado, nunca no carregamento inicial do app. Registro em `THIRD_PARTY_NOTICES.md`.
- WebP 0,9 sem redimensionar: com teto de 500 KB, as imagens já chegam em tamanho razoável e reduzir dimensões é o que mais arrisca nitidez.

## Verificação

- Testes da função de otimização (imagem vira WebP menor; resultado maior cai no original; PDF assinado passa intacto; erro cai no original).
- Teste do banco para os novos tetos em `supabase/tests`.
- Navegador real: enviar capa PNG e PDF de material, conferir tamanho antes e depois no Storage e a capa e o PDF abrindo normalmente, em 360 px e nos dois temas.
- Ajuda e tour das telas de envio atualizados com os novos limites.
