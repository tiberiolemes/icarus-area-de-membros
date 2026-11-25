import { Link } from "react-router-dom";
import { CalendarDays, FolderOpen, HelpCircle, LifeBuoy, MessageSquare, MessageSquareText, Podcast, Trophy } from "lucide-react";
import { useBootstrap } from "./auth";
import { Heading } from "./ui";

/** Módulos que o admin liga e desliga em Configurações. Cursos e Certificados são o núcleo e ficam sempre ligados. */
export const modules = [
  { key: "community", label: "Comunidade", Icon: MessageSquare,
    description: "Some o fórum, o menu e o atalho do celular. Publicações, respostas e curtidas ficam guardadas, e a moderação continua no painel. Os comentários das aulas continuam, porque fazem parte de Cursos." },
  { key: "materials", label: "Materiais", Icon: FolderOpen,
    description: "Some a biblioteca de materiais e o download das pastas. Os anexos de cada aula continuam com Cursos." },
  { key: "podcasts", label: "Podcasts e masterclasses", Icon: Podcast,
    description: "Some o acervo de episódios. Os episódios ficam guardados e podem ser preparados no painel." },
  { key: "ranking", label: "Ranking", Icon: Trophy,
    description: "Some a classificação e os atalhos para ela. Os pontos continuam registrados e voltam completos ao religar." },
  { key: "live_events", label: "Encontros ao vivo", Icon: CalendarDays,
    description: "Some a agenda, a confirmação de presença e as gravações. Os encontros ficam guardados no painel. Links de sala já entregues continuam abrindo fora da plataforma; para encerrar de fato, troque o link na sala." },
  { key: "support", label: "Suporte", Icon: LifeBuoy,
    description: "Some a abertura e o acompanhamento de chamados. Os tickets ficam guardados, e a equipe de suporte continua atendendo pelo painel." },
  { key: "help", label: "Central de ajuda", Icon: HelpCircle,
    description: "Some a central de ajuda e os links para ela, inclusive na tela de entrada. O guia de cada tela continua, e a equipe segue vendo a ajuda." },
  { key: "feedback", label: "Feedback dos alunos", Icon: MessageSquareText,
    description: "Some o botão Enviar feedback do cabeçalho. Os feedbacks recebidos continuam na triagem do painel." },
] as const;
export type ModuleKey = (typeof modules)[number]["key"];
export type Modules = Record<ModuleKey, boolean>;

/** Sem o campo, como num servidor anterior à 2.5.0, tudo continua ligado. */
export function readModules(value: unknown): Modules {
  const state = value && typeof value === "object" ? value as Partial<Record<ModuleKey, unknown>> : {};
  return Object.fromEntries(modules.map(({ key }) => [key, state[key] !== false])) as Modules;
}

export function useModules() {
  return readModules(useBootstrap().data?.settings?.modules);
}

const sections: Readonly<Record<string, ModuleKey | undefined>> = {
  ajuda: "help", comunidade: "community", materiais: "materials", podcasts: "podcasts", ranking: "ranking",
  "encontros-ao-vivo": "live_events", encontros: "live_events", suporte: "support", feedbacks: "feedback",
};

/** Módulo dono de uma rota do aluno (/app), do painel (/admin) ou da Central de ajuda. */
export function moduleOfPath(pathname: string): ModuleKey | undefined {
  const [, area, section = ""] = pathname.split(/[/?#]/);
  if (area === "ajuda") return "help";
  return area === "app" || area === "admin" ? sections[section] : undefined;
}

export function pathOpen(state: Modules, pathname: string) {
  const key = moduleOfPath(pathname);
  return !key || state[key];
}

export function moduleLabel(key: ModuleKey) {
  return modules.find((item) => item.key === key)!.label;
}

export function ModuleUnavailable({ home = "/app/cursos" }: { home?: string }) {
  return (
    <>
      <Heading title="Recurso indisponível">
        Este recurso não está ativo nesta plataforma. Se você já usou, seus dados continuam guardados.
      </Heading>
      <Link className="button" to={home}>Voltar aos cursos</Link>
    </>
  );
}
