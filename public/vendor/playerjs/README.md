# Player.js para Bunny Stream

Arquivo oficial indicado pela documentação Bunny, preservado byte a byte.

- Origem: https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js
- Referência: https://bunny.net/blog/introducing-player-js-support-for-bunny-stream-advanced-player-control-and-monitoring-api/
- Licença upstream preservada em LICENSE: https://github.com/embedly/player.js/blob/master/LICENSE
- SHA256: `48c4f991289c6d484fdfd621b622d2331787aa15a43aa27a081cda86364fd89e`
- Consulta em 23/11/2026. O nome do arquivo é 0.1.0; seu VERSION interno é 0.0.11.

O wrapper Icarus desliga o histórico de logs do SDK e valida tanto origem exata quanto `event.source === iframe.contentWindow` antes de aceitar eventos. Não transmite JWT ao player. Reprodução externa só pode ser homologada depois de configurar uma biblioteca Bunny real; os testes locais do wrapper não comprovam streaming externo.
