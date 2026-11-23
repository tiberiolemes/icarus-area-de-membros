# Retorno local compatível com Argon2

Artefato aceito no recorte de recuperação: `sha256:cec730ebf85a4623b6942a360818b9120be8b4f0951ccf6e16f6668b9817c59f`. Base OLD exata81045; somente `argon2-cffi25.1.0`, `argon2-cffi-bindings25.1.0` e a declaração de `CryptContext` de `context-overlay.json`. O manifesto exige os mesmos wheels e19arquivos de pacote conferidos no r21. Cffi2.1.1 preexistente satisfaz o requisito; nenhuma resolução/atualização implícita.

Os inputs locais verificados estão em `.local/quality/08-old-compat-build/wheels`; seus nomes/SHAs ficam em `wheels-manifest.json` e `requirements.txt`. Outra máquina precisa desses mesmos bytes/base antes de reproduzir. Os scripts usam apenas Docker local, sem rede no container de construção e sem dados/credenciais/volumes de site do projeto. Não executar nos containers de HTTP ou no original.

Receita efetivamente executada, com seus resultados preservados:

1. `python3 local/quality/recovery08/build_recovery.py --wheels .local/quality/08-old-compat-build/wheels` fez criação porID, instalação/overlay exatos e inventários. O CLIcommit final omitiu `Config.ArgsEscaped`; a comparação integral recusou esse resultado,exit1. Esse artefato intermediário09fd73bc não é o retorno aceito.
2. `python3 local/quality/recovery08/commit_recovery.py` enviou Config original completa à API do Engine local, sobre o mesmo container de construção sem dados;status201/exit0. Produziu cec730eb com todos os campos Config iguais, exceto labels explícitas,25camadas-base intactas+1nova. Preserva o primeiro resultado/falha, sem fingir Dockerfile build.
3. A fase HTTP isolada do recibo `docs/audit/quality/evidence/08-r21-recovery-image.json` executou OLD puro→r21→CEC sequencialmente, com clear-cache nativo por site, senha incorreta401, mesma senha200 e hash Argon2 byteigual após CEC. Conteúdo/progresso/acessos/arquivos e estado protegido após cleanup passaram.

Os caminhos de saída fixos recusam sobrescrever evidências; reprodução é em workspace/recursos próprios limpos, com imagens/inputs já carregados. `docker commit` não promete digest byte-reproduzível. Os hashes dos dois scripts efetivamente executados estão nas labels/recibo; não reconstruir r21 por estes arquivos operacionais posteriores.

Usar a receita privada `.local/quality/08-original-rollback/compose.rollback-compat.json`, porID. OLD puro e somente dependências são incompatíveis após hash novo. Não restaurar/rebaixar senhas nem schema. Compatibilidade de recuperação não significa homologar todas as proteções novas no OLD. A política de retenção dos logs históricos continua responsabilidade do operador.
