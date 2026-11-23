import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import { rpc } from "./api";
import { useAuth } from "./auth";
import { Action, Notice } from "./ui";

const steps = [
  {
    target: "navigation",
    title: "Encontre seu caminho",
    body: "O menu reúne os cursos, materiais, certificados, comunidade e suporte. Em uma tela compacta, abra o botão de navegação no topo.",
  },
  {
    target: "courses",
    title: "Continue seu curso",
    body: "Abra um curso para ver os módulos e o progresso. O acesso depende do seu plano e é confirmado pelo servidor.",
  },
  {
    target: "curriculum",
    title: "Abra uma aula",
    body: "Cada aula tem um endereço próprio. O cadeado indica acesso restrito; o indicador de conclusão vem do progresso confirmado.",
  },
  {
    target: "player",
    title: "Assista e registre sua conclusão",
    body: "A retomada usa a posição salva. Use Marcar como concluída quando finalizar a aula; a última aula obrigatória pode emitir o certificado.",
  },
  {
    target: "materials",
    title: "Baixe seus materiais",
    body: "Escolha uma pasta. O botão Baixar solicita uma URL privada temporária, autorizada para sua conta.",
  },
  {
    target: "certificates",
    title: "Consulte seus certificados",
    body: "Depois de concluir as aulas obrigatórias, consulte o documento emitido. PDF e PNG usam os dados da emissão, e o código permite verificar a autenticidade.",
  },
  {
    target: "community",
    title: "Participe com revisão humana",
    body: "Escolha um espaço e escreva uma publicação. Ela fica em revisão até a equipe aprovar. Respostas e edições também são revisadas.",
  },
  {
    target: "support",
    title: "Converse com o suporte",
    body: "Abra um ticket com assunto e mensagem. Acompanhe respostas, arquivos e reabertura dentro da mesma conversa.",
  },
  {
    target: "settings",
    title: "Cuide da sua conta",
    body: "Atualize perfil e empresa, salve o tema por usuário e ative o segundo fator opcional em Segurança. Depois de ativado, o código é confirmado no próprio login. Privacidade permite exportar dados e pedir exclusão.",
  },
  {
    target: "course-editor",
    title: "Publique seu conteúdo",
    body: "Salve o curso, crie módulos, seções e aulas. Defina aulas obrigatórias, regras de acesso e o responsável pelo certificado antes de publicar.",
  },
  {
    target: "admin-export",
    title: "Exporte o resultado completo",
    body: "Em Membros e Pedidos, o CSV inclui todas as páginas da busca atual, até 5.000 registros. Refine a busca quando ultrapassar o limite. Uma falha impede a geração de um arquivo parcial.",
  },
];
export function Tour() {
  const { pathname } = useLocation(),
    { session } = useAuth(),
    [active, setActive] = useState(false),
    [index, setIndex] = useState(0),
    [done, setDone] = useState(false),
    available = steps.filter((step) =>
      document.querySelector(`[data-tour="${step.target}"]`),
    ),
    step = available[Math.min(index, available.length - 1)];
  useEffect(() => {
    setActive(false);
    setDone(false);
    setIndex(0);
  }, [pathname, session?.user.id]);
  useEffect(() => {
    if (!active || !step) return;
    const element = document.querySelector(`[data-tour="${step.target}"]`);
    element?.classList.add("tour-target");
    element?.scrollIntoView({ block: "center", behavior: "instant" });
    return () => element?.classList.remove("tour-target");
  }, [active, step?.target]);
  async function track(action: string, rating: boolean | null = null) {
    await rpc("app_help_feedback", {
      p_page: pathname,
      p_action: action,
      p_rating: rating,
    });
  }
  if (!active && !done)
    return (
      <div className="tour-launch">
        <Action
          run={async () => {
            await track("start");
            setIndex(0);
            setActive(true);
          }}
        >
          <HelpCircle size={18} />
          <span className="sr-only">Guia desta tela</span>
        </Action>
      </div>
    );
  return (
    <aside className="tour-panel" aria-label="Guia desta tela">
      <h2>{done ? "O guia ajudou?" : (step?.title ?? "Conheça esta tela")}</h2>
      {done ? (
        <div className="actions">
          <Action
            run={async () => {
              await track("rate", true);
              setDone(false);
            }}
          >
            Sim
          </Action>
          <Action
            run={async () => {
              await track("rate", false);
              setDone(false);
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
          <p className="meta">
            Passo {Math.min(index + 1, available.length)} de {available.length}
          </p>
          <div className="actions">
            <Action
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
                setActive(false);
              }}
            >
              Pausar
            </Action>
            <Action
              run={async () => {
                await track("skip");
                setActive(false);
              }}
            >
              Pular guia
            </Action>
          </div>
        </>
      )}
      <Link to="/ajuda">Ajuda completa</Link>
    </aside>
  );
}
