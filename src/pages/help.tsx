import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { rpc } from "../api";
import { Action, Back, Heading, Search } from "../ui";
import { PublicFrame } from "./access";

export const articles = [
  {
    slug: "acesso",
    title: "Entre, confirme seu email e recupere o acesso",
    steps: [
      "Na tela Entrar, informe email e senha. Um link de aula recebido é preservado como destino interno depois do acesso.",
      "Se você acabou de criar sua conta, abra a confirmação enviada pelo sistema de autenticação. O link tem validade limitada. Se o login indicar confirmação pendente, use Reenviar confirmação de email para solicitar outro.",
      "Esqueceu a senha? Abra Recuperar acesso e solicite as instruções. O sistema não confirma a existência de uma conta pelo endereço informado.",
      "Complete o perfil e as perguntas de empresa. Responda os campos marcados como obrigatórios. Você pode editar essas respostas em Configurações.",
      "O segundo fator é opcional. Para ativá-lo, abra Sua conta → Segurança e valide o aplicativo autenticador. Nos próximos acessos, o código é solicitado no mesmo formulário de login, sem mudar de página. O servidor mantém essa exigência enquanto houver fator ativo.",
    ],
  },
  {
    slug: "cursos",
    title: "Abra uma aula e continue de onde parou",
    steps: [
      "Em Cursos, escolha um curso na vitrine. Use a ação de iniciar ou continuar para abrir uma aula diretamente. Se preferir escolher a aula, abra a ementa do curso.",
      "Na busca rápida do cabeçalho, digite pelo menos dois caracteres para encontrar cursos, módulos e aulas disponíveis para sua conta. Use Ctrl+K ou ⌘K para focar o campo, as setas para percorrer os resultados, Enter para abrir o item em foco e Escape para fechar a busca.",
      "Use a busca, os filtros e a ordenação para encontrar cursos na vitrine.",
      "Consulte os próximos lançamentos na vitrine. Na página de cada curso, você também encontra os anúncios de módulos quando estiverem disponíveis. Use Quero ser avisado. O sino recebe o aviso quando o conteúdo for publicado, se a opção Lançamentos inscritos estiver ativa nas preferências e você ainda tiver o acesso exigido para o módulo.",
      "Cada curso, módulo e aula tem endereço próprio. Use esses links para retornar diretamente ao conteúdo.",
      "Acima do player, use Anterior ou Próxima aula. Abaixo do player ficam o título e as ações de progresso. No celular, a lista de aulas vem depois da descrição. Em telas maiores, use Conteúdos para abrir ou fechar a lista. Use Filtrar tópicos e aulas para localizar itens do curso.",
      "O cadeado indica acesso restrito. Consulte sua assinatura; o servidor decide o acesso em cada operação.",
      "No vídeo nativo, a posição é salva durante a reprodução e ao pausar. Use Salvar ponto de retomada para confirmar manualmente.",
      "Marque a aula como concluída ao finalizar. O progresso só muda depois da confirmação do servidor. Sem provedor de vídeo configurado, a tela informa a causa.",
    ],
  },
  {
    slug: "materiais",
    title: "Encontre e baixe seus materiais",
    steps: [
      "Abra Materiais no menu e escolha uma pasta. A busca consulta os arquivos da pasta atual.",
      "Use os botões de visualização para alternar entre pastas e arquivos ou exibir apenas os arquivos da seção.",
      "Confira nome, tipo e tamanho. Materiais restritos mostram a opção de consultar o acesso.",
      "Clique em Baixar. O sistema valida seu acesso e solicita um endereço temporário do arquivo.",
      "Se o endereço expirar, solicite o download novamente. Nunca compartilhe um endereço temporário de conteúdo privado.",
    ],
  },
  {
    slug: "podcasts",
    title: "Assista e publique podcasts e masterclasses",
    steps: [
      "Abra Podcasts no menu. Selecione o episódio em destaque ou use a busca por título para localizar outro no acervo.",
      "Abra o episódio para assistir. Use os capítulos disponíveis para avançar no vídeo. Se o player não estiver disponível, use Abrir no YouTube. Quando houver um link cadastrado, use Ouvir no Spotify.",
      "Use Marcar como assistido para salvar a indicação na sua conta. Você pode desfazer a marcação no mesmo episódio.",
      "Na administração, abra Podcasts e escolha Novo episódio. Cole a URL do vídeo do YouTube e preencha os metadados. A miniatura é derivada do vídeo. Para trocar o vídeo de um episódio já salvo, cadastre outro.",
      "Cadastre um capítulo por linha, em ordem crescente, com o horário e o título. Escolha Publicado para exibir no acervo ou Rascunho para ocultar. A opção de destaque substitui o destaque atual ao salvar.",
    ],
  },
  {
    slug: "certificados",
    title: "Consulte e verifique um certificado",
    steps: [
      "Conclua todas as aulas obrigatórias de um curso com certificado habilitado. Currículo vazio não emite certificado.",
      "Abra Certificados para consultar o documento emitido. Se a configuração foi completada depois, use Emitir certificado quando essa ação estiver disponível.",
      "O documento usa o nome, curso, carga horária, responsável e data registrados na emissão. Uma edição posterior não reescreve esse registro.",
      "Use Baixar PDF ou Baixar PNG. Informe o código em Verificar certificado para consultar a validade. A consulta pública funciona sem email ou documento pessoal.",
      "Um certificado de demonstração é identificado como sem validade. Um certificado revogado informa seu estado e não oferece exportação como válido.",
    ],
  },
  {
    slug: "comunidade",
    title: "Publique e acompanhe a revisão humana",
    steps: [
      "Abra Comunidade, escolha um espaço e use Escrever publicação. Informe título, espaço e texto.",
      "Envie para revisão. Apenas você e a equipe autorizada veem a publicação pendente. Você pode anexar uma imagem depois do envio.",
      "A publicação aparece aos demais membros quando a equipe aprovar. Editar o texto envia o conteúdo novamente para revisão.",
      "Abra a publicação para responder ou votar. Respostas também passam por revisão. Em telas maiores, o painel lateral mostra o espaço quando disponível e permite voltar às publicações dele.",
      "No detalhe da sua publicação, use Arquivar publicação para preservar o histórico sem exibi-lo aos demais membros. Restaurar publicação recupera o estado anterior, sem aprovar conteúdo pendente ou rejeitado. Arquivamentos da equipe não podem ser desfeitos por esse controle.",
      "Para denunciar, descreva o motivo. A denúncia entra na fila da equipe; a contagem não remove o conteúdo automaticamente.",
    ],
  },
  {
    slug: "ranking",
    title: "Consulte a classificação preliminar",
    steps: [
      "Abra Ranking pelo menu ou pela barra inferior do Catálogo e do Fórum no celular. Abra o filtro de período. Escolha um atalho, consulte o ranking geral ou selecione Personalizado para informar a data inicial e a final e aplicar o intervalo. Sua colocação aparece mesmo fora da página que está aberta.",
      "A pontuação usa ações reconhecidas pelo servidor, como posts e respostas aprovados, curtidas recebidas, aulas concluídas e certificados emitidos.",
      "As demais colocações aparecem como Membro. O painel indica a disponibilidade de premiação do mês.",
    ],
  },
  {
    slug: "encontros",
    title: "Participe de encontros ao vivo e acesse o acervo",
    steps: [
      "Abra Encontros ao vivo no menu. O próximo encontro em destaque mostra data, horário de Brasília e duração quando seu plano tem acesso.",
      "Use Confirmar presença antes do início. Para mudar de ideia, use Cancelar presença. Baixe o evento em ICS ou abra o Google Agenda para adicionar a data.",
      "Use Entrar na sala para acessar o link quando seu plano inclui o encontro. Gravações anteriores leva ao acervo, onde você pode abrir as gravações publicadas.",
      "Se o conteúdo estiver restrito, use Ver planos disponíveis. A disponibilidade depende das regras de acesso de cada evento.",
      "Na administração, cadastre a data e os links, escolha quem pode acessar, publique o evento e use Ver RSVPs para consultar as confirmações.",
    ],
  },
  {
    slug: "suporte",
    title: "Abra um ticket e acompanhe a conversa",
    steps: [
      "Em Suporte, use Abrir ticket. Escreva assunto, prioridade e mensagem sem senhas ou dados de cartão.",
      "Após o envio, abra a conversa para ler as respostas. Seu texto permanece na tela se uma chamada falhar.",
      "Use Enviar arquivo para anexar um documento permitido. O servidor valida tamanho, tipo e sua permissão.",
      "Um ticket resolvido pode ser reaberto com uma resposta. Arquivos da conversa só abrem para pessoas autorizadas.",
    ],
  },
  {
    slug: "feedback",
    title: "Envie feedback e acompanhe a triagem na administração",
    steps: [
      "No cabeçalho da área do aluno, abra Enviar feedback. Escolha Sugestão, Bug/Problema ou Outro e descreva a situação.",
      "Se precisar, anexe um print PNG, JPG ou WebP de até 5 MiB. Confira se a imagem revela dados pessoais, senhas ou informações de pagamento.",
      "O servidor registra o envio com sua conta. O contexto inclui a seção da plataforma e a família do navegador. Em Configurações → Privacidade, o export de dados inclui os seus envios.",
      "Na administração, use Feedbacks dos alunos. Filtre por tipo ou situação, abra um cartão para consultar o relato e o print, e salve Novo, Em análise, Planejado ou Feito. Administradores com um autenticador ativo confirmam o segundo fator no login.",
    ],
  },
  {
    slug: "notificacoes",
    title: "Leia avisos e ajuste suas notificações",
    steps: [
      "Abra o sino no cabeçalho para ver os avisos recentes. O indicador mostra que há avisos não lidos. Use Escape para fechar o painel e voltar ao sino.",
      "Use a ação do aviso para abrir o destino. Em Ver todas as notificações, use Anterior e Próxima para navegar no histórico quando houver mais páginas.",
      "Use Marcar todas como lidas para limpar os indicadores da sua conta. Se uma ação falhar, tente novamente.",
      "Em Configurações, abra Notificações e ajuste quais eventos deseja receber na plataforma. Cada alteração é salva ao confirmar no servidor. Quando aparece, o e-mail é apenas informativo.",
    ],
  },
  {
    slug: "conta",
    title: "Atualize perfil, tema, segurança e privacidade",
    steps: [
      "Abra Configurações e atualize seu nome, telefone e bio. Para trocar a foto, use Alterar foto, escolha um JPG ou PNG de até 500 KB, ajuste o recorte e clique em Salvar foto. Em Sua empresa, edite as respostas do onboarding.",
      "Abra Guia desta tela no cabeçalho, também no celular. O elemento de cada passo fica iluminado e o restante da tela escurece. Use Pausar para fechar e voltar ao botão.",
      "Alterne o tema no rodapé do menu ou escolha Claro ou Escuro em Aparência e salve. A preferência fica vinculada à sua conta.",
      "Em Segurança, solicite troca de email ou senha. A mudança de email exige confirmação. Você pode ativar a verificação em duas etapas quando quiser. Recomendamos ativá-la em contas administrativas.",
      "Assinatura mostra o plano e a validade confirmados. No checkout, Pix é à vista; o cartão permite escolher de 1 a 12 parcelas, com valores e condições finais no ambiente seguro do provedor. Sem provedor configurado, o checkout informa a indisponibilidade e nenhuma cobrança é realizada.",
      "Se você comprou como visitante, acompanhe o pedido no mesmo navegador por até duas horas a partir do início do pagamento. Se o recibo expirar ou você mudar de navegador, entre com a conta vinculada à compra ou siga as instruções recebidas por email.",
      "Em Privacidade, use Exportar meus dados ou Solicitar exclusão. A política de privacidade fica no link abaixo dessas ações. O pedido aguarda análise de retenção legal; não significa exclusão imediata.",
    ],
  },
  {
    slug: "administracao",
    title: "Cadastre conteúdo e opere as filas",
    steps: [
      "Em Conteúdo, crie um curso e salve. Defina título, endereço, descrição rica e acesso.",
      "Em Cursos e aulas, o editor fica ao lado do currículo em telas largas e abaixo dele em telas estreitas. Ao criar ou editar um item, o editor recebe o foco. Fechar editor retorna ao botão que você usou para abrir a edição.",
      "Em Estrutura e aulas, crie módulos, seções e aulas. Ative Reordenar para revelar Subir e Descer. No editor da aula, Mídia da aula reúne tipo, duração, ID do Bunny e envio de vídeo para uma aula salva.",
      "No editor de um curso ou módulo salvo como rascunho, abra Anúncio de lançamento. Salve o título e o resumo aprovados para os alunos. A previsão é informativa e o aviso só é enviado na publicação.",
      "Abra a edição de uma aula salva e use Editar apresentação para cadastrar subtítulo, capítulos, destaques, fórmula, checklist e CTA. Remover um item publicado também remove as marcações dele.",
      "Configure o responsável pelo certificado antes de habilitar a emissão. Use dados reais ou identifique uma demonstração.",
      "Em Materiais, crie pasta e registro do arquivo, depois envie o arquivo privado. Confira a confirmação do servidor.",
      "Com uma conta administradora, use Administração no topo do menu da área de membros. Instrutores usam Painel de conteúdo, moderadores usam Moderação e a equipe de suporte usa Atendimento. No celular, abra o menu primeiro.",
      "Em Membros, use Abrir ficha na linha da pessoa. Cadastros sem nome mostram Membro sem nome e um identificador curto. Gerencie cortesia, validade, suspensão e papel na ficha. Informe motivo e reautentique. Cortesia não é pagamento.",
      "Na fila da comunidade, revise o conteúdo e confirme uma decisão com motivo. Na fila de suporte, responda a conversa e ajuste o estado.",
      "Em Comunidade, abra Comentários de aula, escolha um curso publicado e uma aula disponível para seu acesso. Revise os itens pendentes e informe o motivo ao aprovar ou rejeitar.",
      "Em Pedidos, escolha uma situação ou busque por ID ou valor em centavos em todas as situações. A lista pagina a consulta selecionada.",
      "Em Membros e Pedidos, a exportação CSV percorre todas as páginas do resultado atual, até 5.000 registros. Refine a consulta acima desse limite. Uma falha interrompe a exportação sem gerar arquivo parcial; o CSV contém somente as colunas autorizadas exibidas nessas listas.",
      "Em Dashboard, abra o filtro de período e escolha um atalho ou Personalizado. Digite as datas ou selecione-as no calendário e clique em Aplicar. A consulta inclui a data final e usa o horário de Brasília. Administradores podem ativar a verificação em duas etapas em Sua conta → Segurança.",
      "Em Analytics, escolha um curso publicado para consultar o funil e a conclusão por aula. A retenção por trecho depende de telemetria de vídeo.",
      "Em Configurações, abra Plataforma e marca para editar o nome exibido. Confira a prévia e salve para publicar. O nome aparece na área pública e nos cabeçalhos da plataforma.",
      "Em Configurações, revise perguntas e versões legais. Na aba Equipe, consulte os papéis e abra Gerenciar membros e equipe para alterar o acesso pela ficha.",
      "Em Auditoria, busque eventos por ação, ator ou alvo e navegue entre as páginas. A trilha mostra o motivo quando registrado.",
      "Em Integrações, escolha Gateway Asaas ou Bunny Stream. Atualizar estado consulta se há configuração no servidor. Configure as credenciais no servidor.",
    ],
  },
];
export function Help() {
  const { artigo } = useParams(),
    [params, setParams] = useSearchParams(),
    { session } = useAuth(),
    q = params.get("q") ?? "",
    article = articles.find((a) => a.slug === artigo);
  return (
    <PublicFrame>
      <div className="reading">
        {artigo ? (
          <>
            <Back to="/ajuda" label="Central de ajuda" />
            <Heading title={article?.title ?? "Artigo não encontrado"} />
            {article ? (
              <>
                <ol className="help-steps">
                  {article.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {session && (
                  <section className="help-feedback" aria-labelledby="help-feedback-title">
                    <h2 id="help-feedback-title">Este artigo ajudou?</h2>
                    <div className="actions">
                      <Action
                        run={() =>
                          rpc("app_help_feedback", {
                            p_page: "/ajuda/" + article.slug,
                            p_action: "rate",
                            p_rating: true,
                          })
                        }
                      >
                        Sim
                      </Action>
                      <Action
                        run={() =>
                          rpc("app_help_feedback", {
                            p_page: "/ajuda/" + article.slug,
                            p_action: "rate",
                            p_rating: false,
                          })
                        }
                      >
                        Não
                      </Action>
                    </div>
                  </section>
                )}
                <section className="help-support" aria-labelledby="help-support-title">
                  <h2 id="help-support-title">Ainda precisa de ajuda?</h2>
                  <p>Abra uma solicitação para conversar com a equipe.</p>
                  <Link className="button" to="/app/suporte/novo">
                    Preciso de suporte
                  </Link>
                </section>
              </>
            ) : (
              <Link className="text-action" to="/ajuda">Ver todos os artigos</Link>
            )}
          </>
        ) : (
          <>
            <Heading title="Como podemos ajudar?">
              Passos para usar sua área de membros.
            </Heading>
            <Search initial={q} onSearch={(q) => setParams({ q })} />
            <div className="help-list">
              {articles
                .filter((a) =>
                  (a.title + " " + a.steps.join(" "))
                    .toLocaleLowerCase("pt-BR")
                    .includes(q.toLocaleLowerCase("pt-BR")),
                )
                .map((article) => (
                  <Link key={article.slug} to={"/ajuda/" + article.slug}>
                    {article.title}
                  </Link>
                ))}
            </div>
            <Link className="text-action" to="/app/cursos">Voltar à área de membros</Link>
          </>
        )}
      </div>
    </PublicFrame>
  );
}
