# Hierarquia do login · 0.1.3

Pedido do titular: recuperação junto da senha, cadastro em frase no rodapé e confirmação de email contextual. O painel Icarus, tema claro inicial, opção escura e alvos44px permanecem.

- Esqueci minha senha está abaixo do campo Senha, à direita.
- Ainda não tem conta? Criar conta fica abaixo de Entrar.
- Reenviar confirmação de email aparece somente após `signInWithPassword` retornar `email_not_confirmed`. A alteração do email e um novo envio descartam esse contexto. O erro é apresentado em português e nenhum reenvio é disparado automaticamente.
- Recuperação, cadastro e confirmação preservam o destino interno sanitizado. MFA permanece no mesmo formulário; SQL, Edge, permissões, dependências e provedores não foram alterados.

## Verificação

41 testes frontend em sete arquivos, typecheck/build e detector de layout passaram. Incluem MFA, retorno contextual, estado inicial sem confirmação, resposta nativa de confirmação pendente, credenciais inválidas sem sugestão, limpeza da senha, preservação do email e ausência de reenvio automático.

A primeira fixture de erro não incluía o header de versão que o SDK instalado exige para interpretar `data.code`; o transporte controlado foi alinhado ao contrato nativo e as assertions mantidas. Os testes simulados e a prova nativa são distintos.

Quatro capturas do login inicial (1280/360, claro/escuro) e duas da confirmação contextual (1280 claro/360 escuro) foram abertas. Campos16px, links44px e ausência de overflow foram medidos. O Auth local com uma conta QA exclusiva não confirmada produziu a mensagem contextual sem trocar documento/endereço. A conta e o perfil QA foram removidos após a conferência; nenhum email foi reenviado ou entregue externamente.

Revisão independente de fonte sem defeito demonstrável no recorte, conferindo também o parser do SDK. Ajuda de acesso alinhada. O login público não monta o componente Tour; não foi criado um guia inoperante para essa tela.

Recibos e capturas ficam no pacote local `icarus-login-links-20261123`; credenciais somente em `.local` ignorado. Não houve teste físico, leitor de tela, CI ou nova homologação externa. As evidências anteriores da aplicação não são novas execuções deste patch. O aviso existente de bundle acima de500kB permanece.
