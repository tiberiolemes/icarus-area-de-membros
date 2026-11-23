# Vitrine de cursos 0.1.5

A proposta visual aprovada foi conectada ao catálogo existente em `/app/cursos`. O destaque e as fileiras usam os cursos, o acesso e o progresso retornados pelo servidor. Cursos sem capa cadastrada recebem o tratamento tipográfico Icarus com seu título real.

Não existem categorias no contrato atual. A organização usa cursos em andamento e exploração dos demais cursos da página, sem temas ou recomendações inventados. A busca e a paginação de 20 itens foram preservadas; o texto informa o recorte da página. Os cartões abrem o detalhe real do curso em SPA. Não há reprodução automática ou alteração de progresso ao navegar pelo catálogo.

## Verificações

- 67 testes frontend em nove arquivos passaram, incluindo 17 casos do catálogo com transporte SDK controlado. Build e typecheck passaram. O aviso anterior de chunk acima de 500 kB permanece.
- A busca dirigida reproduziu a substituição do campo e a transferência de foco pelo controle de navegação. As regressões incluem `RouteFocus` real; a correção sincroniza o campo sem remontá-lo e preserva o foco nas buscas da mesma rota. Paginação, retorno pelo histórico e mudança de rota mantêm o comportamento de navegação existente.
- No navegador, login de demonstração, consulta real, busca vazia, limpeza, detalhe e retorno mantiveram a SPA. A versão final preservou o foco da busca; guia e artigo de ajuda foram conferidos com o novo texto. Nenhuma aula foi aberta nem progresso gravado nesta checagem.
- Desktop de 1440 px e celular emulado de 360 px, nos dois temas, foram capturados e inspecionados sem overflow horizontal da página. Fileiras cheias, nomes longos, acesso restrito e total acima de uma página também foram renderizados com DTOs sintéticos explicitamente identificados e transporte controlado, sem cadastro no banco. As setas avançaram e retornaram o trilho.
- O primeiro preparo da fixture visual falhou porque a consulta veio do cache e não preencheu a observação de transporte. Foi descartado, restaurado o fetch nativo e usada uma fixture explícita. Um ensaio de captura da ajuda teve timeout do Orca; não é prova visual. Quadros capturados durante a transição de tema foram excluídos e substituídos por capturas assentadas, sem modificar o produto.
- A revisão independente e os hashes finais constam no recibo acompanhante. A prova visual é restrita aos estados e tamanhos descritos, sem alegar cobertura de todas as telas.

## Fronteiras preservadas

`app_catalog`, `app_course` e a autorização de mídia continuam no servidor. `can_access` e os dados de progresso são somente apresentação no cliente. A capa continua usando `PrivateImage` e a Edge existente; o caminho de storage não vira URL pública direta. Textos são escapados por React, e o slug ocupa um segmento codificado da rota interna. Os testes dirigidos verificaram conteúdo malicioso, acesso restrito e a chamada de mídia privada.

Sem dependências, migrations, grants, alterações de Auth, cobranças ou configuração de provedores. Ajuda e tour atualizados. A pasta de proposta e seus cursos fictícios não integram a versão publicada. Testes locais não representam GitHub Actions executado, homologação Asaas/Bunny, dispositivo físico, leitor de tela ou instalação no servidor do titular.
