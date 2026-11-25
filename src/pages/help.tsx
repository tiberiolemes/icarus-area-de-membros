import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth, useBootstrap } from "../auth";
import { rpc, useRpc } from "../api";
import { ModuleUnavailable, moduleOfPath, pathOpen, readModules } from "../modules";
import { Action, Back, Empty, Heading, Loading, Notice, QueryState, Search } from "../ui";
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
      "Na tela do código, marque Lembrar por 15 dias para continuar conectado neste navegador sem novo login nem código, mesmo parado, até 15 dias depois do login. Use só em aparelho pessoal. Sem a caixa, a sessão termina após 2 horas sem uso, ou 30 minutos para a equipe. Sair encerra a sessão em todos os aparelhos.",
    ],
  },
  {
    slug: "cursos",
    title: "Abra uma aula e continue de onde parou",
    steps: [
      "Em Cursos, escolha um curso na vitrine. Use Começar ou Continuar para abrir uma aula diretamente. Se preferir escolher a aula, abra a ementa do curso.",
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
      "Abra Materiais no menu e escolha uma pasta. O título identifica a pasta atual e a busca consulta os arquivos dela.",
      "Na raiz de Materiais, use os botões de visualização para alternar entre pastas e arquivos ou exibir apenas os arquivos da seção.",
      "Confira nome, tipo e tamanho. Materiais restritos mostram a opção de consultar o acesso.",
      "Clique em Baixar. O sistema valida seu acesso e solicita um endereço temporário do arquivo.",
      "Se o endereço expirar, solicite o download novamente. Nunca compartilhe um endereço temporário de conteúdo privado.",
    ],
  },
  {
    slug: "podcasts",
    title: "Assista a podcasts e masterclasses",
    steps: [
      "Abra Podcasts no menu. Selecione o episódio em destaque ou use a busca por título para localizar outro no acervo.",
      "Abra o episódio para assistir. Use os capítulos disponíveis para avançar no vídeo. Se o player não estiver disponível, use Abrir no YouTube. Quando houver um link cadastrado, use Ouvir no Spotify.",
      "Use Marcar como assistido para salvar a indicação na sua conta. Você pode desfazer a marcação no mesmo episódio.",
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
      "A badge dourada Admin, com coroa, identifica quem administra a plataforma. Ela aparece ao lado do nome nas publicações e no lugar do plano no cartão da conta. O papel vem do servidor e não pode ser alterado no perfil.",
    ],
  },
  {
    slug: "ranking",
    title: "Consulte a classificação preliminar",
    steps: [
      "Abra Ranking pelo menu ou pela barra inferior no celular. Abra o filtro de período. Escolha um atalho, consulte o ranking geral ou selecione Personalizado para informar a data inicial e a final e aplicar o intervalo. Sua colocação aparece mesmo fora da página que está aberta.",
      "A pontuação usa ações reconhecidas pelo servidor, como posts e respostas aprovados, curtidas recebidas, aulas concluídas e certificados emitidos.",
      "As demais colocações aparecem como Membro. O painel indica a disponibilidade de premiação do mês.",
    ],
  },
  {
    slug: "encontros",
    title: "Participe de encontros ao vivo e acesse o acervo",
    steps: [
      "Abra Encontros ao vivo no menu. O destaque mostra título, convidado, data e horário de Brasília. A duração aparece quando seu plano libera o encontro.",
      "Use Confirmar presença antes do início. Para mudar de ideia, use Cancelar presença. Baixe o evento em ICS ou abra o Google Agenda para adicionar a data.",
      "Use Entrar na sala para acessar o link quando seu plano inclui o encontro. Gravações anteriores leva ao acervo, onde você pode abrir as gravações publicadas.",
      "Se o conteúdo estiver restrito, use Ver planos disponíveis. A disponibilidade depende das regras de acesso de cada evento.",
    ],
  },
  {
    slug: "suporte",
    title: "Abra um chamado e acompanhe a conversa",
    steps: [
      "Em Suporte, use Abrir chamado. Escreva assunto, prioridade e mensagem sem senhas ou dados de cartão.",
      "Após o envio, abra a conversa para ler as respostas identificadas com o selo Equipe. Seu texto permanece na tela se uma chamada falhar.",
      "Use Escolher arquivo, depois Enviar arquivo, para anexar um documento permitido. O servidor valida tamanho, tipo e sua permissão.",
      "Um chamado resolvido pode ser reaberto com uma resposta. Arquivos da conversa só abrem para pessoas autorizadas.",
    ],
  },
  {
    slug: "feedback",
    title: "Envie feedback sobre a plataforma",
    steps: [
      "No cabeçalho da área do aluno, abra Enviar feedback. Escolha Sugestão, Bug/Problema ou Outro e descreva a situação.",
      "Se precisar, anexe um print PNG, JPG ou WebP de até 5 MiB. Confira se a imagem revela dados pessoais, senhas ou informações de pagamento.",
      "O servidor registra o envio com sua conta. O contexto inclui a seção da plataforma e a família do navegador. Em Configurações → Privacidade, o export de dados inclui os seus envios.",
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
      "Em Assinatura, confira o plano atual e a validade, ou use Assinar em um dos planos disponíveis. No checkout, Pix é à vista; o cartão permite escolher de 1 a 12 parcelas, com valores e condições finais no ambiente seguro do provedor. Sem provedor configurado, o checkout informa a indisponibilidade e nenhuma cobrança é realizada.",
      "Quando a instalação usa a verificação de segurança, conclua o desafio antes de continuar para o pagamento. Se ele não carregar, recarregue a página. Várias tentativas seguidas em um minuto são recusadas; aguarde e tente de novo.",
      "Se você comprou como visitante, acompanhe o pedido no mesmo navegador por até duas horas a partir do início do pagamento. Se o recibo expirar ou você mudar de navegador, use Entrar na página do pedido para voltar à mesma consulta depois do login. Use a conta vinculada à compra ou siga as instruções recebidas por email.",
      "Em Privacidade, use Exportar meus dados ou Solicitar exclusão. A política de privacidade fica no link abaixo dessas ações. O pedido aguarda análise de retenção legal; não significa exclusão imediata.",
    ],
  },
  {
    slug: "administracao-podcasts",
    title: "Publique podcasts e masterclasses",
    steps: [
      "Na administração, abra Podcasts e escolha Novo episódio. Cole a URL do vídeo do YouTube e preencha os metadados. A miniatura é derivada do vídeo. Para trocar o vídeo de um episódio já salvo, cadastre outro.",
      "Cadastre um capítulo por linha, em ordem crescente, com o horário e o título. Escolha Publicado para exibir no acervo ou Rascunho para ocultar. A opção de destaque substitui o destaque atual ao salvar.",
    ],
  },
  {
    slug: "administracao-encontros",
    title: "Publique encontros e confira presenças",
    steps: [
      "Na administração, cadastre a data e os links, escolha quem pode acessar, publique o evento e use Ver presenças para consultar as confirmações.",
    ],
  },
  {
    slug: "administracao-feedback",
    title: "Faça a triagem dos feedbacks",
    steps: [
      "Na administração, use Feedbacks dos alunos. Filtre por tipo ou situação, abra um cartão para consultar o relato e o print, e salve Novo, Em análise, Planejado ou Feito. Administradores com um autenticador ativo confirmam o segundo fator no login.",
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
      "Configure o responsável pelo certificado antes de habilitar a emissão. Use dados reais ou identifique uma demonstração. Na aba Certificado do curso, um administrador envia a assinatura em PNG com fundo transparente, até 500 KB. Ela aparece acima do nome do responsável na tela, na verificação pública e no PNG e PDF; certificados já emitidos mantêm a assinatura da emissão.",
      "Em Materiais, crie pasta e registro do arquivo, depois envie o arquivo privado. Confira a confirmação do servidor.",
      "Quando sai uma versão nova do Icarus, administradores veem Versão disponível no topo do painel. Abra Notas da versão e Como atualizar antes de atualizar, ou use Dispensar esta versão para ocultar o aviso até a próxima.",
      "Com uma conta administradora, use Administração, logo abaixo de Configurações no fim do menu da área de membros. Instrutores usam Painel de conteúdo, moderadores usam Moderação e a equipe de suporte usa Atendimento. No celular, abra o menu primeiro.",
      "Em Membros, use Abrir ficha na linha da pessoa. Cadastros sem nome mostram Membro sem nome e um identificador curto. Gerencie cortesia, validade, suspensão e papel na ficha. Informe motivo e reautentique. Cortesia não é pagamento.",
      "Na fila da comunidade, revise o conteúdo e confirme uma decisão com motivo. Na fila de suporte, responda a conversa e ajuste o estado.",
      "Em Comunidade, abra Comentários de aula, escolha um curso publicado e uma aula disponível para seu acesso. Revise os itens pendentes e informe o motivo ao aprovar ou rejeitar.",
      "Em Comunidade, a aba Denúncias mostra primeiro as pendentes, com o título, o trecho e o autor do conteúdo denunciado. Só administradores veem quem denunciou. Use Abrir publicação para ver e moderar o conteúdo e Concluir análise para registrar o resultado da denúncia.",
      "Em Configurações, a aba Privacidade mostra o titular de cada pedido de exportação ou exclusão. Depois de cumprir o pedido fora da plataforma, use Registrar atendimento com a nova situação e o motivo. O registro não exporta nem exclui dados e fica na auditoria.",
      "Em Pedidos, escolha uma situação ou busque por ID ou valor em centavos em todas as situações. A lista pagina a consulta selecionada.",
      "Em Membros e Pedidos, a exportação CSV percorre todas as páginas do resultado atual, até 5.000 registros. Refine a consulta acima desse limite. Uma falha interrompe a exportação sem gerar arquivo parcial; o CSV contém somente as colunas autorizadas exibidas nessas listas.",
      "Em Dashboard, abra o filtro de período e escolha um atalho ou Personalizado. Digite as datas ou selecione-as no calendário e clique em Aplicar. A consulta inclui a data final e usa o horário de Brasília. Administradores podem ativar a verificação em duas etapas em Sua conta → Segurança.",
      "Em Analytics, escolha um curso publicado para consultar o funil e a conclusão por aula. A retenção por trecho depende de telemetria de vídeo.",
      "Em Configurações, abra Plataforma e marca para editar o nome exibido. Confira a prévia e salve para publicar. O nome aparece na área pública e nos cabeçalhos da plataforma.",
      "Em Plataforma e marca, envie a logo colorida, para fundo claro, e a branca, para fundo escuro, em PNG ou WebP de até 500 KB. Confira a prévia nos dois temas e salve cada uma. A logo substitui a do Icarus nos menus, nas telas de entrada, no checkout e no certificado. Sem a branca, a colorida vale nos dois temas. Remover devolve o nome da instalação ou a logo do Icarus. Em Ícone da plataforma, envie o favicon em PNG quadrado, de 180 × 180 px a 4096 px, recomendado 512 × 512 px. Ele aparece nas abas e no atalho do celular, em todas as telas; sem ele, fica o ícone do Icarus.",
      "Em Configurações, abra Módulos para ligar ou desligar Comunidade, Materiais, Podcasts, Ranking, Encontros ao vivo, Suporte, Central de ajuda e Feedback dos alunos. Desligar esconde o recurso dos alunos e bloqueia o acesso no servidor, sem apagar dados, e religar traz tudo de volta. Cursos e Certificados ficam sempre ativos, e nenhuma exportação depende dos módulos. O painel de cada módulo continua acessível, com o selo Desativado. Os comentários das aulas seguem com Cursos, e um link de sala de encontro já entregue continua abrindo até você trocá-lo na sala.",
      "Em Configurações, revise perguntas e versões legais. Na aba Equipe, consulte os papéis e abra Gerenciar membros e equipe para alterar o acesso pela ficha.",
      "Em Auditoria, busque eventos por ação, ator ou alvo e navegue entre as páginas. A trilha mostra o motivo quando registrado.",
      "Em Integrações, escolha Gateway Asaas ou Bunny Stream. Atualizar estado consulta se há configuração no servidor. Configure as credenciais no servidor.",
    ],
  },
];
// Artigo de um módulo desligado sai da lista, como o próprio módulo.
const articleModule = (slug: string) => moduleOfPath("/app/" + ({
  encontros: "encontros-ao-vivo", feedback: "feedbacks", "administracao-podcasts": "podcasts",
  "administracao-encontros": "encontros-ao-vivo", "administracao-feedback": "feedbacks",
}[slug] ?? slug));
const teamArticle = (slug: string) => slug.startsWith("administracao");
const searchable = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

function HelpVote({ slug }: { slug: string }) {
  const [pending, setPending] = useState(false);
  const [voted, setVoted] = useState(false);
  const confirmation = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (voted) confirmation.current?.focus();
  }, [voted]);

  async function rate(p_rating: boolean) {
    setPending(true);
    try {
      await rpc("app_help_feedback", { p_page: "/ajuda/" + slug, p_action: "rate", p_rating });
      setVoted(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="help-feedback" aria-labelledby="help-feedback-title">
      <h2 id="help-feedback-title">Este artigo ajudou?</h2>
      {voted ? <p role="status" tabIndex={-1} ref={confirmation}>Obrigado pelo retorno.</p> : (
        <div className="actions">
          <Action disabled={pending} run={() => rate(true)}>Sim</Action>
          <Action disabled={pending} run={() => rate(false)}>Não</Action>
        </div>
      )}
    </section>
  );
}

export function Help({ member = false }: { member?: boolean }) {
  const { artigo } = useParams();
  const [params, setParams] = useSearchParams();
  const { session, loading } = useAuth();
  const profile = useBootstrap().data;
  const context = useRpc<{ modules?: unknown }>("app_public_context", {}, !member);
  const base = member ? "/app/ajuda" : "/ajuda";
  const modules = readModules(member ? profile?.settings?.modules : context.data?.modules);
  const staff = member && !!profile && profile.profile.role !== "member";
  const q = params.get("q") ?? "";
  const visible = articles.filter(({ slug }) => {
    const key = articleModule(slug);
    return (staff || !teamArticle(slug)) && (!key || modules[key]);
  });
  const article = visible.find(({ slug }) => slug === artigo);
  const terms = searchable(q).trim().split(/\s+/);
  const results = visible.filter(({ title, steps }) => {
    const text = searchable(title + " " + steps.join(" "));
    return terms.every((term) => text.includes(term));
  });
  const related = article ? visible.filter(({ slug }) => slug !== article.slug && teamArticle(slug) === teamArticle(article.slug)).slice(0, 3) : [];
  const groups = [
    { title: "Para alunos", items: results.filter(({ slug }) => !teamArticle(slug)) },
    { title: "Para a equipe", items: results.filter(({ slug }) => teamArticle(slug)) },
  ];

  if (!member && loading) return <PublicFrame><Loading /></PublicFrame>;
  if (!member && session)
    return <Navigate replace to={"/app/ajuda" + (artigo ? "/" + encodeURIComponent(artigo) : "") + (params.size ? "?" + params : "")} />;

  const articleList = (items: typeof articles) => (
    <ul className="help-list">
      {items.map(({ slug, title }) => (
        <li key={slug}><Link to={base + "/" + slug}>{title}<ChevronRight size={18} aria-hidden="true" /></Link></li>
      ))}
    </ul>
  );
  const content = (
    <div className="reading" data-tour={member ? "help": undefined}>
      {!modules.help && !staff ? <ModuleUnavailable home={member ? "/app/cursos" : "/entrar"} /> : (
        <>
          {(member || artigo) && (
            <nav className="help-back" aria-label="Navegação da ajuda">
              {member && <Back to="/app/cursos" label="Voltar à área de membros" />}
              {artigo && <Back to={base} label="Central de ajuda" />}
            </nav>
          )}
          {!modules.help && <Notice>A Central de ajuda está desativada para os alunos. A equipe continua vendo os artigos.</Notice>}
          {artigo ? (
            <>
              <Heading title={article?.title ?? "Artigo não encontrado"} />
              {article && (
                <>
                  <ol className="help-steps">{article.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  {member && <HelpVote key={article.slug} slug={article.slug} />}
                  {related.length > 0 && (
                    <section className="help-support">
                      <h2>Artigos relacionados</h2>
                      {articleList(related)}
                    </section>
                  )}
                  {modules.support && (
                    <section className="help-support">
                      <h2>Ainda precisa de ajuda?</h2>
                      <p>Abra uma solicitação para conversar com a equipe.</p>
                      <Link className="button" to="/app/suporte/novo">Preciso de suporte</Link>
                    </section>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <Heading title="Como podemos ajudar?">Passos para usar sua área de membros.</Heading>
              <Search initial={q} onSearch={(query) => setParams(query ? { q: query } : {})} />
              {results.length ? groups.filter(({ items }) => items.length).map(({ title, items }) => (
                <section className="help-group" key={title}>
                  <h2>{title}</h2>
                  {articleList(items)}
                </section>
              )) : (
                <Empty>
                  <p>Nenhum artigo encontrado.</p>
                  {modules.support && <Link className="text-action" to="/app/suporte">Abrir suporte</Link>}
                </Empty>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
  return member ? content : <PublicFrame><QueryState query={context}>{content}</QueryState></PublicFrame>;
}
