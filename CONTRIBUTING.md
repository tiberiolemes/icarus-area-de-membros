# Contribuindo / Contributing

Envie mudanças para main. Descreva problema, comportamento resultante e validação. Preserve avisos do upstream e identificadores técnicos de pacote, DocType e patches.

Leia o fluxo, consumidores, curso/turma, desktop/mobile e perfis. Reuse frappe-ui e validações de controller. Mantenha autorização no servidor, ações AJAX, foco, erros e entradas. Mudança de tela deve acompanhar tour e artigo público.

Antes de PR/CI, analise risco, estime espera/minutos de runner e valide localmente. Segurança, privacidade, integridade, concorrência, schema e dependências exigem cobertura pertinente. Não afrouxe proteções ou asserções.

Na estrutura bench preparada com as dependências de local/Dockerfile, execute:

    cd frontend
    yarn test --maxWorkers=1

Backend, no bench e em site sintético separado:

    bench --site <test-site> run-tests --app lms

Nunca rode testes destrutivos no site de uso. Não envie .local, .env, bancos, backups, uploads, logs, tokens ou senhas. Use Conventional Commits; alterações visuais incluem capturas dos estados afetados.

Workflows upstream são referência. A CI própria deve revisar dependências, ações, permissões, escopo e custo antes de ativação. Resultados locais não são checks remotos.

## English

Target main with the problem, behavior and validation. Preserve inherited notices and technical identifiers. Read callers and sibling flows; reuse frappe-ui/controller checks, server authorization, AJAX, accessible focus and input/error preservation. Update tours and public help with screen changes.

Estimate runner cost/wait and validate locally before PR/CI. Preserve relevant security, privacy, integrity, concurrency, schema and dependency coverage. Do not weaken assertions.

Use the commands above in a prepared bench and separate synthetic site. Never test destructively on a live site. Submit no credentials, databases, backups, uploads, logs or private environment state. Use Conventional Commits and affected visual captures.

Archived upstream workflows require deliberate adaptation before activation. Local results are not remote checks.
