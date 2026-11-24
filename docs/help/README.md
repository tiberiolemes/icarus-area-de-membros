# Ajuda do Icarus

A ajuda pública é servida em `/ajuda`, com busca e oito artigos. A fonte única do conteúdo está em `src/pages/help.tsx`; não existe um segundo motor de artigos ou tours.

| Artigo | Rotas e fluxo cobertos |
| --- | --- |
| `/ajuda/acesso` | Entrar, confirmação, recuperação, primeira senha do convite, onboarding e MFA |
| `/ajuda/cursos` | Vitrine de cursos com busca, filtros, início e retomada direta da aula, ementa e conclusão confirmada |
| `/ajuda/materiais` | Pastas, busca, acesso e download autorizado |
| `/ajuda/certificados` | Elegibilidade, emissão, PDF/PNG e verificação pública |
| `/ajuda/comunidade` | Espaços, composição, aprovação humana, edição, resposta, voto e denúncia |
| `/ajuda/suporte` | Abertura, conversa, arquivos e reabertura |
| `/ajuda/conta` | Perfil, empresa, tema, segurança, assinatura, retorno do checkout e privacidade |
| `/ajuda/administracao` | Conteúdo, estrutura por teclado, materiais, cortesia, filas e configuração |

`src/tour.tsx` é o único guia React. O usuário inicia o guia da tela atual; o fundo escurece ao redor do elemento destacado e são apresentados somente alvos presentes, com próximo passo, pausa, pulo, conclusão e avaliação. Eventos usam `app_help_feedback` com ator validado no servidor. Feedback de artigo é oferecido somente após login. Não há envio anônimo falso nem dependência de Vue.

Ao mudar uma tela, atualize o artigo correspondente e o passo que usa seu `data-tour`. Textos de ajuda descrevem a configuração disponível; não prometem prazo de suporte, e-mail entregue, cobrança confirmada ou provedor homologado.
