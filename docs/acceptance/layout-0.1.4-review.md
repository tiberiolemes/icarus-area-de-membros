# Revisão final independente — Icarus 0.1.4

**Resultado: sem defeito de fonte remanescente demonstrado no delta e nos consumidores solicitados.** As oito famílias iniciais foram tratadas; um residual de wrap encontrado nesta revisão também foi corrigido pelo coordenador e relido. Isto é aprovação da revisão por fonte, não aceite visual ou homologação.

## Evidências do delta

| Família | Evidência final e conclusão |
|---|---|
| Cabeçalho/guia/conta | `src/shell.tsx:144-155`; `.topbar-tools` em `src/style.css`. Guia e conta agora pertencem ao mesmo grupo flex com gap fixo; no compacto só os detalhes da conta são ocultados, com nome acessível preservado. O nome visível do guia é texto único. |
| Artigo/avaliação/suporte | `src/pages/help.tsx:120-155`; `.help-feedback/.help-support` no CSS. Blocos separados, nomeados e com margem/padding próprios; Sim/Não continuam no mesmo grupo. |
| Hierarquia administrativa | `src/ui.tsx:17-37`; `src/pages/admin.tsx:130-133,1458-1469,1671-1680,1777-1784`. Heading respeita level; listas aninhadas usam h2 e títulos de seus itens usam h3; páginas de lista conservam h1. |
| Provedores | `src/pages/admin.tsx:1645-1658`. Fragment mantém dt/dd como filhos diretos da grade dl, restaurando as linhas nome/estado. |
| Editores em listas longas | `src/pages/admin.tsx:58-69` e sete consumidores de ref={focusEditor}. Todos têm h2 e chave apropriada; o mount foca título/rola editor e a desmontagem retorna ao disparador ainda conectado. React 19 já integra o projeto; nenhuma dependência foi adicionada. |
| Nomes/slug/currículo/pastas | `src/style.css:1040-1073`, spans do currículo e da lista de pastas. Além dos headings, as regiões de linha agora herdam anywhere e o strong direto tem min-width:0. Residual reportado nesta revisão: nome de pasta em `admin.tsx:891` e slug em `admin.tsx:358`; correção final confirmada por fonte. |
| Tour e foco | `src/tour.tsx:65-96,107-124,154-186`; `src/shell.tsx:117-123`. Alvos são coletados no início efetivo, filtrados por getClientRects; navegação compacta tem alvo visível. Painel recebe foco, Pausar/Pular/Escape fecham e devolvem foco ao botão. |
| Ação primária/secundária | `src/ui.tsx:377-400`; `src/tour.tsx:154-179`; `src/pages/learning.tsx:490`. A opção primary reutiliza a classe existente; avanço/conclusão e concluir aula ganham destaque, preservando operações e feedback. |
| Anexos/certificado | `src/pages/support.tsx:162-204`; `src/pages/certificates.tsx:48-70`. Actions usa gap/wrap para arquivos; emissão/abertura de curso têm agrupamento próprio, sem mudar permissões ou emissão. |

Ajuda acompanha guia e abertura/fechamento de editores. Callbacks AJAX, validação e tratamento de erros dos componentes compartilhados foram preservados. Nenhuma API/SQL/Edge foi alterada no delta de fonte revisado.

## Identidade do snapshot

`hashes-final.json` contém SHA-256 completos dos 13 arquivos iniciais, nove alterados. Hashes finais de integração: `admin.tsx = 5eb16eb758ebba8a8f3c4e032429c2517522a7acf85b7320067f5a34c447680f`; `style.css = c38706a4599b1902eb6aca24f89415a80169f7baef908b5a9a279f9c249bbd07`. Teste novo lido, sem execução: `src/layout.test.tsx = 8b5941097de9fca2356ac6559c1f9ffa7ad2cf0414783eee089a974dd618f711`.

Referência base informada pelo coordenador: e021b0e. Sem usar Git, a comparação independente foi contra os bytes preservados em `baseline/src`; o delta está em `source-delta.diff`. Não alego ter confirmado identidade Git da base.

## Detector e limites

Varredura mecânica inicial separada: exit 0, `[]`, em `detector-layout.json`. Não foi repetida após alterações e não é evidência de scan final. A lista acima deriva de leitura independente de fonte/delta e consumidores, não do detector.

Não executei build, testes, servidor, DB, browser, Git ou publicação; não editei fonte. Li o teste focado novo e não repeti as 49 verificações relatadas pelo coordenador. Medidas computadas, render claro/escuro, 360px, zoom, clipping, teclado real e build final com o último CSS continuam sob a validação do coordenador; as primeiras capturas do build sem esse CSS não validam estes hashes.


---

# Adendo independente — agrupamento das ações do formulário

**Sem defeito demonstrado no delta adicional.** Revisão somente de `src/ui.tsx`, `src/pages/community.tsx`, `src/pages/admin.tsx` e `src/layout.test.tsx`; o primeiro `review-final.md/json` e seus hashes ficam preservados como histórico.

- **Contrato compartilhado:** `ui.tsx:178-195,263-275` adiciona somente `secondaryAction?: ReactNode`, depois do botão de envio no footer existente. Primário e secundário pertencem ao mesmo fieldset `disabled={busy || disabled}`. Interceptação AJAX, validação, lock, erros, sucesso e liberação em finally permanecem intactos; consumidores sem prop mantêm o comportamento anterior.
- **Composer:** `community.tsx:289-304,348-358` move o mesmo callback de Descartar e voltar para depois de Enviar para revisão. Preserva a limpeza do rascunho, estado dirty e navegação interna. O botão continua `type="button"`, portanto descarte não submete nem exige validação do formulário.
- **Seis editores:** `admin.tsx:905,950,1298,1560,1693,1830` move Fechar editor para o footer dos formulários de pasta, material, plano, espaço, documento e pergunta. Cada ação mantém seu setter e recebe `type="button"`; o antigo botão externo foi removido. Os sete `ref={focusEditor}` anteriores continuam, preservando retorno ao disparador na desmontagem. Estrutura mantém seu fechamento de cabeçalho em `admin.tsx:698`, conforme escopo explícito.
- **Teste novo lido:** `layout.test.tsx:71-83` confere adjacência após primário, callback de cancelar, bloqueio de ambos com Promise pendente e liberação posterior. O teste existente do editor confere que fechar não grava em `app_admin_save`. Não executei esses testes.
- **Layout existente reaproveitado:** `.form-actions` continua com gap e wrap; no compacto a ação primária ocupa a linha inteira e a secundária segue a ordem DOM. Nenhum CSS ou componente adicional foi necessário.

## Snapshot e hashes

Os três arquivos de runtime foram comparados com os bytes da revisão anterior, reconstruídos de baseline + delta histórico, com SHA-256 conferido contra `hashes-final.json`. O teste anterior também foi reconstruído removendo só o acréscimo e confirmou seu SHA-256 histórico.

| Arquivo | SHA-256 final |
|---|---|
| src/ui.tsx | a5025e99c7834d81ac22a1532eb0f75e3394e102098519bccc18413f93ad663c |
| src/pages/community.tsx | dbb01376d71a293682f725162826a5e60d66d3e09330bd05cf6acaf40efeff67 |
| src/pages/admin.tsx | 276aa5981cc2e18eafdf8eae28082347b75076a1a2efff5cf2d266ee1c162bd2 |
| src/layout.test.tsx | ca73ea0f5e0f98556d00700e5b6b19c3f4bfd2d7e9bf42d9933f178ca5488a8e |

Delta e hashes completos em `addendum/delta-form-actions.diff` e `addendum/hash-form-actions.json`. Nenhuma fonte foi editada por esta revisão.

Limites: aprovação por fonte; sem suíte, build, browser, detector, runtime, DB ou Git. Render, foco real, comportamento de teclado e build final desses bytes ficam com o coordenador. Não estendo esta revisão a outros formulários ou novas mudanças posteriores.


---

# Adendo mínimo — alvo da conta no cabeçalho

**Sem defeito demonstrado no delta de uma linha.** Em `src/style.css:662-669`, `.account-link` troca `min-width:0` por `min-width:44px`, mantendo `min-height:44px`. No compacto, `.account-details` fica oculto e o link conserva `flex-shrink:0` (`style.css:1431-1435`); o alvo passa a ter mínimo de 44×44px, enquanto `.avatar` permanece visualmente 40×40px.

Consumidor confirmado em `src/shell.tsx:144-154`: o Link continua com nome acessível, destino interno e o mesmo avatar. Nenhum JS, comportamento de navegação, tema, propriedade do avatar ou outra regra CSS mudou no comparativo com a fonte anteriormente revisada.

SHA-256 final de `src/style.css`: `50027a6258e2fbb6adc796020910ab98e4bd722f8ea77663baed41f0d0b134d0`.

SHA-256 de `src/shell.tsx`, inalterado: `b5623dcd2c257047ca11555c437e9e3795face568c3f83d913f8cd4bc4653c4c`.

Relatórios anteriores preservados. Revisão somente por fonte, sem auditoria repetida, suíte, build, detector ou browser. As 217 capturas são evidência relatada pelo coordenador; este adendo não afirma tê-las inspecionado nem recapturado. Build e medidas finais do cabeçalho em 360/768/1024/1280 e dois temas ficam com o coordenador.
