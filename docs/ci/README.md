# Ativar GitHub Actions

O pipeline permanece como modelo em [verify.yml](verify.yml). A trilha nativa precisa de um runner com Docker dedicado para executar a instalação limpa no GitHub Actions.

Antes de publicar o modelo, adapte o runner da trilha nativa. O `ubuntu-latest` padrão, sem configuração adicional, para na etapa que exige a declaração do daemon. Prepare para cada job um runner Linux efêmero com Docker Engine 29.x estável a partir da 29.10.0, daemon exclusivo, armazenamento vazio e socket privado. Exporte `ICARUS_INSTALL_DOCKER_HOST`, `ICARUS_INSTALL_DOCKER_ID` e `DOCKER_HOST` a partir do provisionamento via `GITHUB_ENV`. Confirme as portas livres e os demais requisitos antes de rodar o instalador. Jobs de PR devem usar ambiente descartável sem credenciais de deploy. [Requisitos do Docker dedicado](../operations.md#requisitos-do-docker-dedicado).

Com o runner preparado e uma credencial do proprietário que permita workflows, mova o arquivo para `.github/workflows/verify.yml` e publique pelo processo normal de revisão. Os testes locais do pipeline dispensam segredos de Supabase e de provedores.

Há um único job. Mudança de aplicação, banco, integração, testes ou dependências executa frontend, contratos, dublês do instalador e Supabase nativo. Documentação fica fora dos gatilhos, e assets isolados executam as verificações de frontend. A trilha completa mantém a cobertura de autenticação, integridade e dinheiro.

Estimativa inicial sem medição no GitHub: 5–8 minutos de espera e de runner na trilha completa, sem matriz. Downloads das imagens podem aumentar esse tempo. YAML e referências dos actions foram verificados; execução e custo reais de Actions ainda não foram medidos.

Até a ativação, execute os comandos locais do README e preserve os resultados em `docs/acceptance`. Não use badge de CI verde sem execução correspondente ao commit publicado.
