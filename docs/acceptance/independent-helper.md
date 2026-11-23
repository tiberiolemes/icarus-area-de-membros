# Adendo final — helper operacional

**Sem defeito demonstrável nos deltas nomeados.** Veredito restrito ao helper, sem reabrir R1–R4 ou aprovar operação externa.

HEAD `337a582043ecd00b9e9d2a6d96d158afeb806bd5`; commits `d05a46f5e9a5352210b4c6e2a36d74efd2403587` e `337a582043ecd00b9e9d2a6d96d158afeb806bd5` (fontes informadas `df4b8c5` e `b0865fb`). Árvore `src`: `8b313f1f7f9c3a385e0d0d29651847740d179316`.

## Conferência conectada

- **PID/TERM:** Antes de sinalizar, confere comando/fonte do PID registrado; após SIGTERM e espera, só ESRCH autoriza considerar encerrado. Se continua vivo ou há erro de permissão, não apaga registro nem anuncia encerramento. Sem SIGKILL novo. Referências: `scripts/local.mjs:9`, `scripts/local.mjs:14`, `scripts/local.mjs:18`.
- **Log:** Arquivo existente não é truncado; abertura append e chmod600 mantêm diagnóstico anterior privado. Não li conteúdo do log ou env. Referências: `scripts/local.mjs:37`.
- **Journal/Docker:** Start aguarda saúde global e EdgeHTTP200 antes do finalize. Guard limita journal não vazio a no máximo três nomes únicos DB/kong/inbucket do projeto exato. Consumidor revalida allowlist, configuração profunda da substituição e ID/nome/estado parado do original; DELETE por ID com v=false, sem remoção de volume/imagem. Journal é arquivado privado e removido após finalize. Referências: `scripts/local.mjs:124`, `scripts/local.mjs:129`, `scripts/local-bindings.mjs:90`, `scripts/local-bindings.mjs:103`.
- **Readiness:** Orçamento de sondagem Edge aumentado de30 para90segundos; requisições têm timeout5s e resultado registra duração/PID/fonte. Última resposta em curso pode atravessar marginalmente o deadline de sondagem; não equivale a timeout global rígido de todo o start. Não há novo cold90 comprovado nesta revisão. Referências: `scripts/local.mjs:48`, `scripts/local.mjs:56`.
- **Export protections:** Delta apenas exporta a função existente; assinatura/corpo SQL permanecem iguais. Importar backup.mjs não executa main por causa do guard de entrypoint. Sem alteração de concessões/restore neste delta. Referências: `scripts/backup.mjs:16`.

## Prova proporcional

`node --test scripts/local.test.mjs`: **1 aprovado, 0 falhas**, cerca de3,23s. Apenas processo próprio que ignoraTERM e fixturetemporária; registro/PID preservados na rejeição e cleanup do filho no finally. Nenhum serviço real tocado.

Recibos Root inspecionados por whitelist:

- `cold-cycle-evidence.json`: primeira tentativa fria=false; recuperação sem outrostop=true; 67tabelas, binários e proteções iguais; Config/HostConfig/mounts sem diferenças registradas; journal ausente e zero backups técnicos restantes; capabilities200, webhook não configurado503, provedores desligados.
- `cold-edge-observed.json`: **exit inicial1** e primeiro200 observado após33,69s no **mesmoPID**, sem segundo cold.
- `edge-readiness.json`: ready=true, orçamento90000ms e duração16ms na continuaçãoUP; **não comprova novo cold com90s**.

## Limites

- Primeiro cold composto permanece FAIL/exit1; o stderr genérico não reconstrói sua causa e a observação33,69s não prova que essa causa foi timeout. HTTP200 posterior no mesmoPID e continuaçãoUP não apagam a falha.
- Não executei novo cold/stop/start, ciclo90s, reset/drop, testeDB, suíte de contratos/UI ou publicação. Não há RootDropDataset inferido.
- Recibos sanitizados foram lidos por campos booleanos/contagens/duração; não li logs privados completos, env, tokens, dumps ou hashesAuth.
- QA separada ativa58622 e episódio137/recuperação foram contexto informado pelo coordenador, fora desta verificação; não atesto estacionamento nem repito SQL/race. Core/UI e seus relatórios não foram reabertos.
- Veredito vale somente para os deltas nomeados na fonte337a582, sem garantia de comportamento futuro ou homologação externa.

## SHA256

| Arquivo | SHA256 |
|---|---|
| `scripts/local.mjs` | `674b0708f779a7e5daf9c657f9896b20ba743d10ff9c83400db9dd79a3bdb784` |
| `scripts/local.test.mjs` | `1cde87aa00b2316946c44ed0311add2d41edc6fe6e4793e218c39d97f53c7ac6` |
| `scripts/backup.mjs` | `68319d0b083695ca8d7f7b13dfb0e2f95aa0841a369116deedbfed5050e3641b` |
| `scripts/local-bindings.mjs` | `379f0aa31a322e5ec10bb70710331b4774ad837e2e165b45db14f6d829bd9552` |

Somente este relatório e seu JSON foram produzidos, além da fixturetemporária descartada do selfcheck autorizado. Arquivos não rastreados preexistentes foram preservados.
