import {
  BookOpen, GraduationCap, LayoutDashboard, LifeBuoy, Plug, Rocket, Settings, ShieldCheck, UserCog, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "../modules";
import { memberArticles } from "./help-articles-member";
import { teamArticles } from "./help-articles-team";
import { integrationArticles } from "./help-articles-integrations";

/** Texto dos artigos aceita **rótulo da tela**, `valor literal` e [link](/ajuda/artigo ou https://…). */
export type HelpImage = { src: string; width: number; height: number; alt: string; caption?: string };
export type HelpStep = string | { text: string; image?: HelpImage; note?: string };
/** steps numera um caminho; list reúne itens sem ordem; image ilustra a seção, com os números batendo com os passos. */
export type HelpSection = { title?: string; intro?: string; image?: HelpImage; steps?: HelpStep[]; list?: string[]; note?: string; warn?: string };
export type HelpArticle = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  /** Módulo dono do artigo: desligado, o artigo some para o aluno. */
  module?: ModuleKey;
  need?: string[];
  sections: HelpSection[];
  /** Pergunta de quem travou e a saída. */
  trouble?: [string, string][];
  related?: string[];
};
export type HelpCategory = { id: string; title: string; description: string; team: boolean; Icon: LucideIcon };

export const categories: HelpCategory[] = [
  { id: "primeiros-passos", title: "Primeiros passos", description: "Entre na plataforma, conheça o menu e proteja a sua conta.", team: false, Icon: Rocket },
  { id: "cursos-e-aulas", title: "Cursos e aulas", description: "Assista às aulas, baixe os materiais e emita o seu certificado.", team: false, Icon: GraduationCap },
  { id: "comunidade-e-eventos", title: "Comunidade e eventos", description: "Participe das conversas, dos encontros ao vivo e do ranking.", team: false, Icon: Users },
  { id: "conta-e-assinatura", title: "Conta e assinatura", description: "Cuide do perfil, dos avisos, do plano e dos seus dados.", team: false, Icon: UserCog },
  { id: "ajuda-e-suporte", title: "Ajuda e suporte", description: "Fale com a equipe ou envie uma sugestão.", team: false, Icon: LifeBuoy },
  { id: "painel", title: "Começar no painel", description: "Entenda o painel, os papéis da equipe e os números da operação.", team: true, Icon: LayoutDashboard },
  { id: "conteudo", title: "Cursos e conteúdo", description: "Crie cursos, aulas, materiais, podcasts e encontros ao vivo.", team: true, Icon: BookOpen },
  { id: "membros-e-vendas", title: "Membros e vendas", description: "Consulte membros, libere acessos, crie planos e acompanhe pedidos.", team: true, Icon: Wallet },
  { id: "moderacao-e-atendimento", title: "Moderação e atendimento", description: "Aprove publicações e comentários, responda chamados e leia feedbacks.", team: true, Icon: ShieldCheck },
  { id: "configuracoes", title: "Configurações da plataforma", description: "Ajuste a marca, os recursos ativos, o primeiro acesso e os documentos legais.", team: true, Icon: Settings },
  { id: "integracoes", title: "Integrações", description: "Conecte pagamentos, vídeo e proteção contra robôs, com imagens de cada tela.", team: true, Icon: Plug },
];

export const articles: HelpArticle[] = [...memberArticles, ...teamArticles, ...integrationArticles];

export const categoryOf = (article: HelpArticle) => categories.find(({ id }) => id === article.category)!;

/** Remove a marcação, para a busca comparar só o texto. */
export const plain = (text: string) => text.replace(/\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\([^)]+\)/g, "$1$2$3");

export function articleText({ title, summary, need = [], sections, trouble = [] }: HelpArticle) {
  const steps = sections.flatMap(({ title, intro, image, steps = [], list = [], note, warn }) => [title, intro, image?.alt, image?.caption, note, warn, ...list,
    ...steps.flatMap((step) => typeof step === "string" ? [step] : [step.text, step.note, step.image?.alt, step.image?.caption])]);
  return plain([title, summary, ...need, ...steps, ...trouble.flat()].filter(Boolean).join(" "));
}
