# Ativar GitHub Actions

O pipeline está preparado em [verify.yml](verify.yml), mas não está ativo. A credencial usada para publicar esta versão autoriza o repositório e não inclui o escopo `workflow`. Não foi alterada a autenticação de outras contas para contornar essa restrição.

Com uma credencial do proprietário que permita workflows, mova o arquivo para `.github/workflows/verify.yml` e publique pelo processo normal de revisão. Nenhum segredo de Supabase ou de provedor é necessário para os testes locais do pipeline.

Há um único job. Mudança de aplicação, banco, integração, testes ou dependências executa frontend, contratos e Supabase nativo. Documentação não dispara o workflow; assets isolados executam as verificações de frontend. A cobertura de autenticação, integridade e dinheiro não é removida para economizar runner.

Estimativa inicial sem medição no GitHub: 5–8 minutos de espera e de runner na trilha completa, sem matriz. Downloads das imagens podem aumentar esse tempo. YAML e referências dos actions foram verificados; execução e custo reais de Actions ainda não foram medidos.

Até a ativação, execute os comandos locais do README e preserve os resultados em `docs/acceptance`. Não use badge de CI verde sem execução correspondente ao commit publicado.
