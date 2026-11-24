import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import { rpc } from "./api";
import { useAuth } from "./auth";
import { Action } from "./ui";

const steps = [
  {
    target: "navigation",
    title: "Encontre seu caminho",
    body: "O menu reúne cursos, materiais, certificados, comunidade e suporte. No celular, abra o menu pelo topo. Contas administradoras têm o atalho Administração no início do menu da área de membros. No catálogo e no fórum, a barra inferior também dá acesso ao Ranking. Materiais fica disponível no menu em ambos os temas.",
  },
  {
    target: "member-search",
    title: "Encontre cursos, módulos e aulas",
    body: "Abra a busca pelo ícone do cabeçalho e digite pelo menos dois caracteres. Use Ctrl+K ou ⌘K para focar, as setas para percorrer os resultados, Enter para abrir e Escape para fechar. Buscar no catálogo leva o termo até Cursos.",
  },
  {
    target: "courses",
    title: "Escolha um curso ou retome sua aula",
    body: "Abra a aula pelo botão de iniciar ou continuar. Use a busca e os filtros para encontrar outro curso, ou abra a ementa para escolher entre as aulas.",
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
    body: "A retomada usa a posição salva. No celular, a lista de aulas vem depois da descrição e a seta no topo volta ao módulo. Em telas maiores, use Conteúdos para abrir ou fechar a lista. Ao finalizar, marque a aula como concluída.",
  },
  {
    target: "materials",
    title: "Baixe seus materiais",
    body: "Escolha uma pasta. O botão Baixar solicita uma URL privada temporária, autorizada para sua conta.",
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
    body: "Abra um ticket com assunto e mensagem. Acompanhe respostas, arquivos e reabertura dentro da mesma conversa.",
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
    body: "Atualize perfil e empresa, salve o tema por usuário e ative o segundo fator opcional em Segurança. Recomendamos ativá-lo para contas administrativas. Depois de ativado, o código é confirmado no próprio login. Em Privacidade, exporte dados ou peça exclusão; a política fica abaixo dessas ações.",
  },
  {
    target: "notification-preferences",
    title: "Escolha os avisos da plataforma",
    body: "Altere as opções disponíveis para sua conta na coluna Na plataforma. A escolha muda quando o servidor confirma o salvamento.",
  },
  {
    target: "course-editor",
    title: "Publique seu conteúdo",
    body: "Em Estrutura e aulas, use Reordenar para revelar as setas. Abra uma aula para editar a mídia e acessar Editar apresentação. Em um curso ou módulo salvo como rascunho, use Anúncio de lançamento para editar o que os alunos verão antes da publicação.",
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
    target: "analytics-retencao",
    title: "Confira a cobertura da retenção",
    body: "A medição por trecho requer eventos de reprodução. A tabela de progresso informa marcações de conclusão.",
  },
  {
    target: "admin-settings-brand",
    title: "Edite o nome da plataforma",
    body: "Confira a prévia e use Salvar nome para publicar. Se outra sessão tiver alterado o nome, revise o valor publicado antes de reenviar.",
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
    title: "Consulte a configuração dos provedores",
    body: "Escolha Gateway Asaas ou Bunny Stream. Atualizar estado consulta a configuração no servidor.",
  },
  {
    target: "order-filters",
    title: "Consulte os pedidos por situação",
    body: "Escolha uma situação para filtrar o livro de vendas. A busca por ID ou valor em centavos consulta todas as situações. O CSV segue a consulta atual.",
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
    [active, setActive] = useState(false),
    [index, setIndex] = useState(0),
    [done, setDone] = useState(false),
    [available, setAvailable] = useState<typeof steps>([]),
    step = available[Math.min(index, available.length - 1)];
  const launch = useRef<HTMLDivElement>(null), panel = useRef<HTMLElement>(null);
  const spotlight = useRef<HTMLDivElement>(null);
  const adminSettingsScreen = pathname === "/admin/configuracoes";
  const rankingScreen = pathname === "/app/ranking";
  const adminReport = pathname === "/admin/dashboard" || pathname === "/admin/analytics";
  const adminOrders = pathname === "/admin/pedidos";
  const params = new URLSearchParams(search);
  const settingsTab = adminSettingsScreen || pathname === "/app/configuracoes" ? params.get("aba") : null;
  const provider = adminSettingsScreen && settingsTab === "integracoes" ? params.get("provedor") : null;
  const podcastScreen = pathname === "/app/podcasts" || /^\/admin\/podcasts(?:\/|$)/.test(pathname);
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
      if (event.key === "Escape") { event.stopPropagation(); close(); }
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
            {step?.body ??
              "Consulte a central de ajuda para ver os passos completos deste fluxo."}
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
      <Link className="text-action" to={adminSettingsScreen || adminReport || adminOrders ? "/ajuda/administracao" : rankingScreen ? "/ajuda/ranking" : podcastScreen ? "/ajuda/podcasts" : "/ajuda"}>
        Ajuda completa
      </Link>
    </aside>
    </>,
    document.body,
      )}
    </>
  );
}
