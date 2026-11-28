import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import { rpc } from "./api";
import { useAuth, useBootstrap } from "./auth";
import { readModules, type Modules } from "./modules";
import { HelpLink } from "./help-link";
import { helpPathFor } from "./pages/help-paths";
import { Action } from "./ui";

const steps = [
  {
    target: "navigation",
    title: "Encontre seu caminho",
    body: "",
  },
  {
    target: "help",
    title: "Consulte a Central de ajuda",
    body: "Busque por uma palavra ou escolha um assunto para ver os artigos. Em cada artigo, você pode dizer se ele ajudou. Use Voltar à área de membros para retornar aos cursos.",
  },
  {
    target: "member-search",
    title: "Encontre cursos, módulos e aulas",
    body: "Abra a busca pelo ícone do cabeçalho e digite pelo menos dois caracteres. Use Ctrl+K ou ⌘K para focar, as setas para percorrer os resultados, Enter para abrir e Escape para fechar. Buscar no catálogo leva o termo até Cursos.",
  },
  {
    target: "courses",
    title: "Escolha um curso ou retome sua aula",
    body: "Na página do curso, use Começar ou Continuar para abrir a aula. Use a busca e os filtros para encontrar outro curso, ou abra a ementa para escolher entre as aulas.",
  },
  {
    target: "course-catalog",
    title: "Encontre um curso",
    body: "Filtre os cursos por andamento, conclusão ou acesso restrito. Você também pode buscar um curso ou alterar a ordem dos resultados.",
  },
  {
    target: "course-syllabus",
    title: "Escolha uma aula na ementa",
    body: "Abra um módulo para ver as aulas e selecione a que deseja assistir. O cadeado identifica conteúdo restrito.",
  },
  {
    target: "curriculum",
    title: "Abra uma aula",
    body: "Use Filtrar tópicos e aulas para localizar itens deste curso. Cada aula tem um endereço próprio. O cadeado indica acesso restrito; o indicador de conclusão vem do progresso confirmado.",
  },
  {
    target: "player",
    title: "Assista e registre sua conclusão",
    body: "A retomada usa a posição salva. No celular, a lista de aulas vem depois da descrição e a seta acima do conteúdo volta ao módulo. Em telas maiores, use Conteúdos para abrir ou fechar a lista. Ao finalizar, marque a aula como concluída.",
  },
  {
    target: "materials",
    title: "Baixe seus materiais",
    body: "Escolha uma pasta e confira o nome dela no título. O botão Baixar solicita uma URL privada temporária, autorizada para sua conta.",
  },
  {
    target: "podcasts",
    title: "Assista a um episódio",
    body: "Abra o destaque ou busque pelo título no acervo. No episódio, escolha um capítulo para avançar e use Marcar como assistido para salvar a indicação na sua conta.",
  },
  {
    target: "admin-podcasts",
    title: "Gerencie os episódios",
    body: "Use Novo episódio para cadastrar um vídeo ou Editar para rever um episódio salvo. O estado Publicado exibe o episódio no acervo. Somente um episódio publicado pode ficar em destaque por vez.",
  },
  {
    target: "podcast-editor",
    title: "Edite e publique um episódio",
    body: "Preencha os metadados, informe os capítulos em ordem e escolha o estado. Salve para confirmar as mudanças no acervo.",
  },
  {
    target: "certificates",
    title: "Consulte seus certificados",
    body: "Depois de concluir as aulas obrigatórias, consulte o documento emitido. PDF e PNG usam os dados da emissão, e o código permite verificar a autenticidade.",
  },
  {
    target: "community",
    title: "Participe com revisão humana",
    body: "Escolha um espaço e escreva uma publicação. Publicações, respostas e edições passam por revisão. Em telas maiores, consulte o Ranking pela lateral do fórum. No detalhe, você pode arquivar sua publicação preservando o histórico e restaurar o que você mesmo arquivou, no estado anterior.",
  },
  {
    target: "live-events",
    title: "Acompanhe encontros e gravações",
    body: "Confirme presença, adicione o encontro ao calendário ou entre na sala. Use Gravações anteriores para ir ao acervo. Os controles disponíveis seguem seu plano.",
  },
  {
    target: "admin-live-events",
    title: "Gerencie os encontros",
    body: "Cadastre a data e os links, configure o acesso, publique e consulte as presenças confirmadas.",
  },
  {
    target: "support",
    title: "Converse com o suporte",
    body: "Abra um chamado com assunto e mensagem. Acompanhe respostas, arquivos e reabertura dentro da mesma conversa. O selo Equipe identifica as respostas do atendimento.",
  },
  {
    target: "send-feedback",
    title: "Envie uma sugestão ou relate um problema",
    body: "Use Enviar feedback no cabeçalho. Escolha o tipo, descreva o que aconteceu e, se precisar, selecione um print.",
  },
  {
    target: "admin-feedbacks",
    title: "Faça a triagem dos feedbacks",
    body: "Filtre por tipo ou situação. Abra um cartão para ler a descrição, consultar o print e salvar a nova situação.",
  },
  {
    target: "notification-bell",
    title: "Veja seus avisos",
    body: "Abra o sino para ver avisos recentes e use Ver todas as notificações para abrir o histórico. Escape fecha o painel e retorna ao sino.",
  },
  {
    target: "notification-history",
    title: "Consulte o histórico",
    body: "Abra o destino de um aviso ou marque todos como lidos. Use Anterior e Próxima quando o histórico tiver mais de uma página.",
  },
  {
    target: "settings",
    title: "Cuide da sua conta",
    body: "Atualize perfil e empresa. Para trocar a foto, use Alterar foto e confirme em Salvar foto. Salve o tema por usuário e ative o segundo fator opcional em Segurança. Recomendamos ativá-lo para contas administrativas. Depois de ativado, o código é confirmado no próprio login. Em Privacidade, exporte dados ou peça exclusão; a política fica abaixo dessas ações.",
  },
  {
    target: "notification-preferences",
    title: "Escolha os avisos da plataforma",
    body: "Altere as opções disponíveis para sua conta na coluna Na plataforma. A escolha muda quando o servidor confirma o salvamento.",
  },
  {
    target: "course-editor",
    title: "Publique seu conteúdo",
    body: "Em Estrutura e aulas, use Reordenar para arrastar os itens pela alça ou mudar a ordem com as setas. Abra uma aula para editar a mídia e acessar Editar apresentação. Em um curso ou módulo salvo como rascunho, use Anúncio de lançamento para editar o que os alunos verão antes da publicação.",
  },
  {
    target: "ranking",
    title: "Consulte sua colocação",
    body: "Use um atalho de período ou escolha Personalizado para consultar seus pontos e sua posição entre duas datas. Use Como pontuar para ver as ações consideradas.",
  },
  {
    target: "dashboard-periodo",
    title: "Escolha o período do Dashboard",
    body: "Use os atalhos de período ou selecione Personalizado. Escolha as duas datas e clique em Aplicar para consultar os indicadores do intervalo.",
  },
  {
    target: "analytics-curso",
    title: "Consulte o progresso por curso",
    body: "Escolha um curso publicado para abrir o funil e a tabela de aulas. As contagens usam os registros de progresso.",
  },
  {
    target: "admin-settings-brand",
    title: "Edite o nome, a logo e o ícone da plataforma",
    body: "Use Salvar nome para publicar o nome. Se outra sessão tiver alterado o nome, revise o valor publicado antes de reenviar. Envie a versão colorida e a branca em SVG, PNG ou WebP. Confira o encaixe nos menus, nas telas de entrada, no painel e no certificado, nos dois temas, antes de salvar. O favicon aceita SVG ou PNG quadrado.",
  },
  {
    target: "admin-settings-certificate",
    title: "Defina o modelo de certificado",
    body: "Preencha o responsável e o cargo e use Salvar modelo. Envie a assinatura em PNG no cartão Assinatura. Os cursos em Usar o modelo global saem com estes dados, e os certificados já emitidos não mudam.",
  },
  {
    target: "admin-settings-modules",
    title: "Escolha os módulos da plataforma",
    body: "Use o interruptor de cada módulo para ligar ou desligar. Desligar esconde o recurso dos alunos e bloqueia o acesso no servidor, sem apagar dados. A mudança vale assim que o servidor confirma.",
  },
  {
    target: "admin-settings-team",
    title: "Consulte os papéis da equipe",
    body: "Para alterar papel ou acesso, use Gerenciar membros e equipe e abra a ficha da pessoa. Informe o motivo e confirme sua identidade.",
  },
  {
    target: "admin-settings-audit",
    title: "Consulte os eventos de auditoria",
    body: "Busque por ação, ator ou alvo. Use Anterior e Próxima para navegar. O motivo aparece quando foi registrado.",
  },
  {
    target: "admin-settings-providers",
    title: "Configure pagamentos e vídeo",
    body: "Escolha o provedor, salve com senha e 2FA e use Testar conexão. No Asaas, copie a URL e o token do webhook. Cobranças em produção têm confirmação própria.",
  },
  {
    target: "member-filters",
    title: "Encontre membros por papel, plano e situação",
    body: "Use os filtros juntos ou procure por nome, empresa ou e-mail. Equipe reúne os papéis administrativos e de operação. O resultado e a exportação seguem os filtros atuais.",
  },
  {
    target: "support-filters",
    title: "Filtre a fila de atendimento",
    body: "Busque pelo assunto, escolha uma prioridade ou abra uma situação. As contagens consideram todos os chamados correspondentes ao assunto e à prioridade.",
  },
  {
    target: "order-filters",
    title: "Consulte os pedidos por situação",
    body: "Escolha uma situação para filtrar o livro de vendas. A busca por ID ou valor em reais consulta todas as situações. O CSV segue a consulta atual.",
  },
  {
    target: "admin-export",
    title: "Exporte o resultado completo",
    body: "Em Membros e Pedidos, o CSV inclui todas as páginas do resultado atual, até 5.000 registros. Refine a consulta quando ultrapassar o limite. Uma falha impede a geração de um arquivo parcial.",
  },
  {
    target: "lesson-comment-moderation",
    title: "Revise comentários de aula",
    body: "Abra um comentário pendente, escolha Aprovar ou Rejeitar e informe o motivo. A decisão só aparece após a confirmação do servidor.",
  },
  {
    target: "lesson-presentation-editor",
    title: "Monte a apresentação da aula",
    body: "Cadastre capítulos, destaques, fórmulas, checklist e CTA conforme o conteúdo. Ao remover um item já salvo, confirme a exclusão das marcações associadas.",
  },
];
// O passo do menu cita só os módulos ligados nesta plataforma.
function navigationBody(state: Modules) {
  const sections = ["cursos", state.materials && "materiais", "certificados",
    state.community && "comunidade", state.support && "suporte"].filter(Boolean) as string[];
  const listed = sections.length > 1 ? `${sections.slice(0, -1).join(", ")} e ${sections.at(-1)}` : sections[0];
  return [
    `O menu reúne ${listed}. No celular, abra o menu pelo topo.`,
    "Contas administradoras têm o atalho Administração logo abaixo de Configurações, no fim do menu da área de membros. Instrutores, moderadores e suporte têm, no mesmo lugar, atalhos para suas ferramentas.",
    state.ranking && "A barra inferior do celular também dá acesso ao Ranking.",
    state.materials && "Materiais tem um atalho na barra inferior do celular.",
  ].filter(Boolean).join(" ");
}
function visibleTarget(target: string) {
  const region = [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)]
    .find((element) => element.getClientRects().length > 0);
  if (!region || region.getBoundingClientRect().height < window.innerHeight * 0.75) return region;

  // Long feeds and curricula can fill the entire viewport. Anchor their step to a visible heading or control.
  const candidates = region.querySelectorAll<HTMLElement>("h1, h2, h3, summary, a[href], button, input, select");
  return [...candidates].find(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.height < window.innerHeight / 2;
  }) ?? region;
}
export function Tour() {
  const { pathname, search } = useLocation(),
    { session } = useAuth(),
    boot = useBootstrap().data,
    modules = readModules(boot?.settings?.modules),
    helpOpen = modules.help || (!!boot && boot.profile.role !== "member"),
    [active, setActive] = useState(false),
    [index, setIndex] = useState(0),
    [done, setDone] = useState(false),
    [available, setAvailable] = useState<typeof steps>([]),
    step = available[Math.min(index, available.length - 1)];
  const launch = useRef<HTMLDivElement>(null), panel = useRef<HTMLElement>(null);
  const spotlight = useRef<HTMLDivElement>(null);
  const adminSettingsScreen = pathname === "/admin/configuracoes";
  const params = new URLSearchParams(search);
  const settingsTab = adminSettingsScreen || pathname === "/app/configuracoes" ? params.get("aba") : null;
  const provider = adminSettingsScreen && settingsTab === "integracoes" ? params.get("provedor") : null;
  useEffect(() => {
    setActive(false);
    setDone(false);
    setIndex(0);
  }, [pathname, settingsTab, provider, session?.user.id]);
  useLayoutEffect(() => {
    const hole = spotlight.current, card = panel.current;
    if (!active || !step || !hole || !card) return;
    let target: HTMLElement | undefined;
    let frame = 0;
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    const measure = () => {
      frame = 0;
      const next = visibleTarget(step.target);
      if (next !== target) {
        if (target) {
          target.classList.remove("tour-target");
          resize?.unobserve(target);
        }
        target = next;
        if (target) {
          target.classList.add("tour-target");
          target.scrollIntoView({ block: "center", behavior: "instant" });
          resize?.observe(target);
        }
      }
      if (!target) {
        setAvailable(available => available.filter(item => item.target !== step.target));
        return;
      }
      const rect = target.getBoundingClientRect();
      const left = Math.max(0, rect.left - 4), top = Math.max(0, rect.top - 4);
      const right = Math.min(document.documentElement.clientWidth, rect.right + 4);
      const bottom = Math.min(window.innerHeight, rect.bottom + 4);
      hole.hidden = right <= left || bottom <= top;
      Object.assign(hole.style, {
        left: left + "px", top: top + "px", width: Math.max(0, right - left) + "px",
        height: Math.max(0, bottom - top) + "px",
      });
      const panelRect = card.getBoundingClientRect();
      const sharesColumn = !hole.hidden && right > panelRect.left && left < panelRect.right;
      const below = window.innerHeight - bottom;
      const room = Math.max(top, below) - 28;
      card.toggleAttribute("data-at-top", sharesColumn && top > below);
      if (sharesColumn && room >= 160) card.style.setProperty("--tour-room", room + "px");
      else card.style.removeProperty("--tour-room");
    };
    measure();
    resize?.observe(card);
    resize?.observe(document.body);
    const changes = new MutationObserver(schedule);
    changes.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      changes.disconnect();
      resize?.disconnect();
      target?.classList.remove("tour-target");
      card.removeAttribute("data-at-top");
      card.style.removeProperty("--tour-room");
      hole.hidden = true;
    };
  }, [active, step]);
  useEffect(() => {
    if (active || done) panel.current?.focus({ preventScroll: true });
  }, [active, done, step?.target]);
  function close() {
    setActive(false);
    setDone(false);
    requestAnimationFrame(() => launch.current?.querySelector("button")?.focus());
  }
  async function track(action: string, rating: boolean | null = null) {
    await rpc("app_help_feedback", {
      p_page: pathname,
      p_action: action,
      p_rating: rating,
    });
  }
  return (
    <>
      <div className="tour-launch" ref={launch}>
        <Action
          disabled={active || done}
          run={async () => {
            await track("start");
            setAvailable(steps.filter((step) => visibleTarget(step.target)));
            setIndex(0);
            setActive(true);
          }}
        >
          <HelpCircle size={18} aria-hidden="true" />
          <span>Guia desta tela</span>
        </Action>
      </div>
      {(active || done) && createPortal(
    <>
    {active && step && <div className="tour-shade" aria-hidden="true"><div className="tour-spotlight" ref={spotlight} /></div>}
    <aside className="tour-panel" aria-label="Guia desta tela" ref={panel} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === "Escape" && event.currentTarget.contains(event.target as Node)) {
        event.stopPropagation();
        close();
      }
    }}>
      <h2>{done ? "O guia ajudou?" : (step?.title ?? "Conheça esta tela")}</h2>
      {done ? (
        <div className="actions">
          <Action
            run={async () => {
              await track("rate", true);
              close();
            }}
          >
            Sim
          </Action>
          <Action
            run={async () => {
              await track("rate", false);
              close();
            }}
          >
            Não
          </Action>
        </div>
      ) : (
        <>
          <p>
            {step?.target === "navigation" ? navigationBody(modules) : step?.body ?? (helpOpen
              ? "Abra Ajuda completa para ver os passos deste fluxo sem sair da tela."
              : "Esta tela ainda não tem um guia próprio.")}
          </p>
          {step && <p className="meta">
            Passo {Math.min(index + 1, available.length)} de {available.length}
          </p>}
          <div className="actions">
            <Action
              primary
              run={async () => {
                if (index + 1 >= available.length) {
                  await track("complete");
                  setActive(false);
                  setDone(true);
                } else setIndex(index + 1);
              }}
            >
              {index + 1 >= available.length ? "Concluir" : "Próximo passo"}
            </Action>
            <Action
              run={async () => {
                await track("pause");
                close();
              }}
            >
              Pausar
            </Action>
            <Action
              run={async () => {
                await track("skip");
                close();
              }}
            >
              Pular guia
            </Action>
          </div>
        </>
      )}
      {helpOpen && (
        <HelpLink className="text-action" to={helpPathFor(pathname, search)}>
          Ajuda completa
        </HelpLink>
      )}
    </aside>
    </>,
    document.body,
      )}
    </>
  );
}
