# Aceite autenticado local da equipe Icarus

23/11/2026 · `http://127.0.0.1:8088` · **Recortes finitos desta tarefa concluídos, com limitações abaixo.**

`report_source_hash`: `83980b7e37d7fe3470cd200ecc6e1b1306b20f9d` (HEAD integrado ao fechar QA); árvore `src` `8b313f1f7f9c3a385e0d0d29651847740d179316`. Último delta de UI integrado pelo root: `6827672` (worker `4d99b757beeb2aa8264d44801a4808651a0a08d6`). Metadados/scripts Ops posteriores não mudaram a UI durante os recortes finais.

QA executado pelo autor da UI, em perfil Orca isolado, somente com contas e conteúdo DEMONSTRAÇÃO. Não substitui revisão independente de segurança nem aceite humano. Nenhum SQL forçou papel, AAL, fator, progresso, certificado, plano ou moderação; as mudanças abaixo passaram pelos componentes reais, SDK Auth nativo, Edge e RPC locais. Leituras de confirmação usaram o cliente autorizado da aplicação.

## Evidências integradas já aprovadas

| Recorte | Resultado observado |
| --- | --- |
| Admin, MFA e onboarding | Login por senha, matrícula TOTP e challenge/verify nativos; AAL2 confirmado pelo SDK. Empresa obrigatória salva no formulário. Fator admin preservado em arquivo privado 600, caminho documentado em `.local/ACESSOS.md`, sem segredo neste relatório. |
| R1 opcional MFA Pro | Inicialmente zero fatores. Enroll/verify nativo criou fator QA; logout GLOBAL204. Novo login apenas com senha retornou AAL1/nextAAL2, UI pediu desafio e app_catalog direto negou P0001 sem dados. Challenge/verify retornou AAL2, RPC aceitou e catálogo real mostrou dois cursos. Botão Remover autenticador, confirmação e unenroll nativos em AAL2 removeram somente esse fator. Novo logout204/login confirmou zero fatores, AAL1/nextAAL1, RPC e UI aceitos. Admin preservado e member intocado. Recibo sanitizado `staff-pro-native-mfa-receipt.json`; arquivos efêmeros secretos Pro do QA removidos. |
| Curso e editor | Criado `DEMONSTRAÇÃO QA staff 20261123`, descrição TipTap, acesso members; módulo, seção e duas aulas de texto obrigatórias publicadas. Botão de ordem operado com foco+Enter persistiu aula um=0 e aula dois=1. |
| Arquivar e restaurar | Reautenticação por senha e confirmação nativas arquivaram e restauraram o mesmo curso; leitura final published, progresso100, certificado não revogado. Audit archive `a2fb72f6-d352-4fe0-b99a-59bcfc0f33c1`; restore `f891ffed-9934-4ffa-a2d5-9b4a3f997d19`. |
| Certificado legítimo DEMONSTRAÇÃO | Responsável sintético explicitamente configurado no curso. Ambas as aulas obrigatórias concluídas pelos botões reais; segunda confirmação emitiu o certificado no servidor. Snapshot, visualização, verificação e botões de download PDF/PNG reais usados. Não se passou objeto constante ao exportador neste recorte. |
| Ficha, cortesia e reauth | Consulta e revisão do member sintético; cortesia do plano DEMONSTRAÇÃO local até 23/12/2026, motivo registrado e reauth nativa. Servidor confirmou papel member preservado, source courtesy/status active, pedidos0 e audit `ccf01f44-9e75-45e7-b2c6-2cef937069ff`. Sem cobrança. Root foi avisado após confirmação. |
| Comunidade | Post do root `DEMONSTRAÇÃO QA post integrado` estava pending; admin revisou corpo, selecionou aprovação e motivo, confirmou decisão; leitura posterior approved e UI atualizada. |
| Suporte | Ticket urgent do root recebeu resposta admin via AJAX com estado waiting_member confirmado no servidor. Anexo sintético enviado pelo componente real; botão de download abriu mídia privada e corpo recuperado correspondeu ao texto da fixture. URL assinada permanece somente em arquivo privado. Após integração, nova resposta sintética confirmou textarea limpa, seletor waiting_member preservado após reset, sucesso e um único botão de anexo; captura `staff-support-after-fix.png` aberta para inspeção. |
| CSV | Exportação real filtrada de Membros gerou download `membros-icarus.csv`, uma linha DEMONSTRAÇÃO member, papel Membro, situação Ativo. Recheck integrado gerou novo download e os bytes nativos74, BOM239/187/191, SHA256 `1c67fb33e8b15a9b22527256af9fc7f7eeb266a3c7be2423b49399b048b4b26b`, salvos exatamente em `staff-members-filtered-native.csv`. Extração anterior por Blob.text tem71 bytes sem BOM, identificada separadamente. Paginação21/25 e erros foram testes controlados, não25 contas nativas. |
| Temas e 360 | Admin salvou dark no servidor e persistiu após navegação/reload; Pro abriu light em perfil isolado. A909 e360, scrollWidth igual à viewport e centro de Salvar ponto de retomada desobstruído, altura44,398px. Mesmo guia agora no header. Gaveta aberta por teclado e fechada com Escape; capturas abertas para inspeção. |

## Identificadores e arquivos

- Curso `d1f8e44e-1f15-4ca0-8e25-70922869d0b8`, slug `demonstracao-qa-staff-20261123`.
- Módulo `b5ac97bd-f42f-4039-a3f7-43c5e55293c7`, seção `b0e96343-ceff-4e0e-8609-02c43ae11f03`; aulas `e3c42fc0-2c43-4677-8d99-4b68b1710e19` e `88b0ef25-f4fe-4e00-8e74-f1efbf9f6047`.
- Certificado servidor `fdf0b3ae-e1fc-4324-8184-8f71c85dc054`, código público `0c40f237e21004a124bdfc2eba9183995b34c1c0e9955c51`; snapshot demo=true, duração2min, assinatura opcional ausente, responsável DEMONSTRAÇÃO.
- PDF `staff-certificate-real.pdf`, 136597 bytes, SHA256 `55ab3dbc03a9b9a1095aa895f79628ae0e081366004123a4f8e400e642db49a5`; PNG `staff-certificate-real.png`, 141730 bytes, SHA256 `47a7a37d9a80cc4d5ba879e4003338fbbe0c447a4750691c09891e37a18a83dd`.
- PDF reconhecido por file/pdfinfo, 1 página800×560pt; PNG1600×1120. PDF renderizado pelo Poppler foi aberto: acentos, curso, aluno, responsável e código íntegros. PDF rasterizado sem texto selecionável/marcação semântica.
- `staff-certificate-server-snapshot.json`, `staff-artifact-receipt.json` contêm snapshot e hashes. `staff-909-target.png`, `staff-360-target.png`, `staff-360-header.png` preservam as capturas inspecionadas.
- Ticket `1871ffcb-5b47-42d2-b46f-286723333139`; post `a5e937cc-61eb-41de-953c-32283b7d443b`.

## Falhas reais encontradas e mudanças autorizadas

| Fonte | Correção e verificação proporcional |
| --- | --- |
| `47caa88d7d7d6a70f4a1f2ce7956d1cf956acef9` | CSV completo filtrado Membros/Pedidos, whitelist, limite5000 explícito, sem arquivo parcial se falhar ou total mudar, fórmula neutralizada; erro de transporte Functions em português. Sete testes dirigidos aprovados, inclui21/25, busca Unicode/fórmula, erro/limite. |
| `89c68f77b6162a3bd6b9925566a2cfe70b38f3c5` | Guia fixo cobria Salvar ponto a909; mesmo componente movido ao header. Medidas e inspeção real909/360 acima. Typecheck/build aprovados. |
| `0ccad44cb8eaa64af9937e6a40b53980e0657519` | Rótulos de papel PT, revisão de membro não anuncia Salvo antes da reauth, helper signOut verifica result.error do SDK sem mudar escopo GLOBAL. Dois testes dirigidos aprovados e rechecagem CSV compatível. `staff-member-review-before-fix.png` preserva falha. Logout500 real foi FK de nonce no backend, corrigida em018 pela outra frente; este QA não atribui essa causa à UI. |
| `a8ca8919e3989118184b2ed63607083e7c5f462f` | Após responder suporte, seletor voltavaOpen embora servidor waiting_member; mesmo anexo aparecia duas vezes. Correção mantém estado confirmado após reset e deduplicaIDs. Um teste do componente real aprovado, typecheck/build aprovados. `staff-support-before-fix.png` preserva falha. |
| `4d99b757beeb2aa8264d44801a4808651a0a08d6` | Consumidor checkout oferecia sóÀvista apesar contrato1..12. Select agora1..12, Pix serializa1, sem inventar juros. Ajuda atualizada. Três testes do Checkout real + SDK com fetch controlado aprovados: cartão2, cartão12, Pix1 após seleção12. Typecheck/build aprovados. Não houve Asaas real. |

## Limites e interrupções

Não foram homologados Asaas/Bunny/e-mail externo, compra real, nuvem, produção, capacidade pública ou textos jurídicos. Upload material500MiB/stop-start/gateway e revisão AppSec independente pertencem às outras frentes. Pedidos CSV não foi exercitado com pagamento real; apenas helper controlado e lista financeira local honesta. Nenhum papel humano foi alterado; a revisão PT de papel usa componente/teste e o member permaneceu member. A verificação pública do certificado foi aberta no perfil admin, ainda não em sessão anônima neste recorte.

HMR do root invalidou refs durante uma edição; texto não salvo foi restaurado antes de persistir, sem registrar mudança indevida. Alguns cliques Orca mobile reportaram unchanged enquanto teclado Enter funcionou; não se declarou aprovado toque físico. O campo datetime-local de cortesia precisou setter/eventos DOM por limitação de automação; submissão, reauth e RPC continuaram pelos componentes reais. O build avisa chunk inicial acima500kB, sem alegação de desempenho medido.

A pedido de Ops, enrollment Pro ainda não verificado foi cancelado via componente/unenroll e listFactors retornou zero antes da janela. Após HTTPREADY, ocorreu a única prova R1 completa descrita acima, seguida da limpeza nativa. Recheck final360 confirmou scrollWidth360, tema dark persistido, guia no header e centro de retomada livre (altura44,3984375px); captura `staff-360-final.png` aberta para inspeção. Não restam mutações ou formulários pendentes desta frente; nenhum provedor externo foi homologado.
