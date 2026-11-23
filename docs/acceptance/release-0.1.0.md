# Aceite técnico local · 0.1.0

23/11/2026. Destino autorizado: `tiberiolemes/icarus-area-de-membros`, público, branch `main`, licença MIT. Fase 1 mais comunidade com moderação manual. Implementação nova React/TypeScript/Supabase e Design System Icarus; nenhum aceite Frappe foi transferido. O histórico público é preservado e a árvore antiga é substituída por commit normal.

## Verificações concluídas

| Fronteira | Evidência |
|---|---|
| Instalação frontend independente | `npm ci`, typecheck/build e 31 testes em seis arquivos no clone de publicação |
| Edge Functions | Nove handlers checados; 34 testes de transporte simulado, identificados como tal |
| Postgres | 18 migrations com histórico nativo na instalação QA; 223 assertions SQL e quatro verificações separadas de concorrência com duas conexões |
| Auth, Storage e email local | Dois testes nativos com nove passos, incluindo convite Mailpit, confirmação, primeira senha, autorização e arquivo privado |
| MFA | Equipe e membro com fator verificado: AAL1 negado, desafio nativo AAL2 aceito; limpeza exclusiva do fator QA do membro |
| Convite pós-pagamento | Webhook financeiro sintético HTTP, persistência, execução automática e Mailpit; duplicata sem novo convite e falha de transporte com retry durável. Nenhuma cobrança |
| Upload | 56 MiB reais, reserva, envio JWT, finalize e Range206; limite configurado de 500 MiB não é prova de transferência de 500 MiB |
| Backup/restore | 67 tabelas e cinco binários iguais; owners, RLS, policies, default ACL e 339 verificações RPC/papel mais 201 tabela/papel; omissão de ACL reprovada |
| Navegador | Aluno, equipe, suporte/anexo, moderação, cortesia/reauth, arquivo/restauro, tema, retomada de vídeo e certificado real; recortes e limites nos relatórios vinculados |
| Artefato servido | Build de produção em loopback, 20 arquivos obtidos por HTTP byteiguais ao disco; certificado público aberto em perfil novo sem erro de console |
| Revisão independente | R1–R4 corrigidos; adendo PID/Docker/readiness sem novo defeito demonstrável no escopo |

Os denominadores são de suítes diferentes; repetições de uma suíte não aumentam a contagem. Árvore `src` homologada: `8b313f1f7f9c3a385e0d0d29651847740d179316`. O build sinaliza chunk principal acima de 500 kB; editor rico é carregado separadamente. Não há benchmark de capacidade pública inferido.

## Operação observada e limitações

A primeira partida fria composta terminou exit1; o diagnóstico antigo não permite reconstruir a causa. A recuperação ocorreu no mesmo processo Edge, seguida de continuação UP com HTTP200 e preservação de dados/configuração. O novo orçamento de readiness é 90 segundos; não houve outra partida fria para promovê-lo como prova. O [adendo independente](independent-helper.md) mantém essa distinção.

Ao estacionar a QA isolada, o encerramento genérico do coordenador terminou137, sem OOM. O volume foi preservado; recuperação verificou 18 migrations, RLS e reexecutou os mesmos 223 assertions e quatro casos concorrentes com sucesso. Uma tentativa posterior de parada nativa acionou a política de reinício já existente. A QA ficou saudável e preservada em execução, sem afetar a aplicação principal. Não é estacionamento aprovado nem perda de dados.

O runtime local usa fonte da árvore coordenadora, portas em loopback e provedores Asaas/Bunny desligados. Recibos brutos, acessos, dumps e URLs assinadas ficam somente em `.local/`, ignorada pelo Git. A instalação demo original recebeu DDL explicitamente; seu histórico não foi fabricado. O histórico nativo foi provado na QA separada.

## Pendências da instalação futura

- Configurar Supabase/HTTPS/SMTP, integrações Asaas Sandbox e Bunny e executar a homologação externa antes de venda real.
- Aprovar os documentos jurídicos e a oferta; demonstração não habilita cadastro/venda com aceite fictício.
- Executar teste com pessoas e validar o uso no servidor do responsável. Emulação móvel não prova dispositivo ou toque físico; PDF rasterizado não é PDF semanticamente acessível.
- Ativar GitHub Actions a partir do [template](../ci/README.md): a credencial atual não possui escopo `workflow`. Não existe execução CI verde inferida dos testes locais.

## Relatórios

- [Backend](backend.md), [integrações e operação](integrations.md), [frontend](frontend.md).
- [Aluno](browser-member.md), [equipe](browser-staff.md).
- [Revisão inicial](independent-initial.md), [revisão focada](independent-focused.md), [adendo operacional](independent-helper.md).
- [Instalação e primeiro administrador](../operations.md).

A publicação do código é distinta de implantação hospedada e de homologação dos provedores. Esta versão não declara encerramento integral do padrão de qualidade, SLA ou venda real.
