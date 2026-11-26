import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Lightbulb, TriangleAlert } from "lucide-react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth, useBootstrap } from "../auth";
import { rpc, useRpc } from "../api";
import { ModuleUnavailable, readModules } from "../modules";
import { Action, Back, Empty, Heading, Loading, Notice, QueryState, Search } from "../ui";
import { PublicFrame } from "./access";
import { articles, articleText, categories, categoryOf, type HelpArticle, type HelpImage } from "./help-content";

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

function Shot({ image }: { image: HelpImage }) {
  return (
    <figure className="help-shot">
      <a href={image.src} target="_blank" rel="noopener noreferrer">
        <img src={image.src} width={image.width} height={image.height} alt={image.alt} loading="lazy" decoding="async" />
        <span className="sr-only"> Abre a imagem ampliada em nova aba.</span>
      </a>
      <figcaption>{image.caption} Toque ou clique na imagem para ampliar.</figcaption>
    </figure>
  );
}

function Callout({ warn = false, children }: { warn?: boolean; children: ReactNode }) {
  const Icon = warn ? TriangleAlert : Lightbulb;
  return (
    <p className={warn ? "help-callout help-warn" : "help-callout"}>
      <Icon size={20} aria-hidden="true" />
      <span><strong>{warn ? "Atenção." : "Dica."}</strong> {children}</span>
    </p>
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
  const q = (params.get("q") ?? "").trim();
  // Artigo de um módulo desligado some para o aluno; a equipe mantém os do painel, que segue funcionando.
  const visible = articles.filter((article) => {
    const { team } = categoryOf(article);
    return (staff || !team) && (!article.module || modules[article.module] || (staff && team));
  });
  const shown = (slug: string) => visible.find((item) => item.slug === slug);
  const article = artigo ? shown(artigo) : undefined;
  const sections = categories.filter(({ id }) => visible.some((item) => item.category === id));
  const category = sections.find(({ id }) => id === params.get("categoria"));
  const terms = searchable(q).trim().split(/\s+/);
  const results = q ? visible.filter((item) => {
    const text = searchable(articleText(item));
    return terms.every((term) => text.includes(term));
  }) : [];
  const related = article ? (article.related ?? []).map(shown).filter((item): item is HelpArticle => !!item).slice(0, 3) : [];

  if (!member && loading) return <PublicFrame><Loading /></PublicFrame>;
  // toString, e não size: o Safari anterior ao 17 não tem URLSearchParams.size e perderia a busca.
  const query = params.toString();
  if (!member && session)
    return <Navigate replace to={"/app/ajuda" + (artigo ? "/" + encodeURIComponent(artigo) : "") + (query && "?" + query)} />;
  // Artigo da equipe aberto sem sessão: o endereço está certo, falta entrar.
  const locked = !member && articles.some((item) => item.slug === artigo && categoryOf(item).team);

  // **rótulo**, `valor literal` e [link](/ajuda/artigo ou https://…). Link para artigo escondido vira texto.
  const rich = (text: string) => text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part) ?? [];
    if (!href) return part;
    if (!href.startsWith("/ajuda/")) return <a key={index} href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
    return shown(href.slice(7)) ? <Link key={index} to={base + href.slice(6)}>{label}</Link> : label;
  });
  const articleList = (items: HelpArticle[]) => (
    <ul className="help-list" role="list">
      {items.map(({ slug, title, summary }) => (
        <li key={slug}>
          <Link to={base + "/" + slug}>{title}</Link>
          <p>{summary}</p>
          <ChevronRight size={18} aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
  const categoryGrid = (team: boolean) => (
    <ul className="help-categories" role="list">
      {sections.filter((item) => item.team === team).map(({ id, title, description, Icon }) => {
        const count = visible.filter((item) => item.category === id).length;
        return (
          <li key={id}>
            <Icon size={24} aria-hidden="true" />
            <Link to={`${base}?categoria=${id}`}>{title}</Link>
            <p>{description}</p>
            <small>{count} {count === 1 ? "artigo" : "artigos"}</small>
          </li>
        );
      })}
    </ul>
  );
  const index = q ? (
    <>
      <Heading title="Resultados da busca">{results.length === 1 ? "1 artigo encontrado" : `${results.length} artigos encontrados`} para “{q}”.</Heading>
      <Search initial={q} label="Buscar na ajuda" placeholder="Buscar por palavra" onSearch={(query) => setParams(query ? { q: query } : {})} />
      {results.length ? sections.filter(({ id }) => results.some((item) => item.category === id)).map(({ id, title }) => (
        <section className="help-group" key={id}>
          <h2>{title}</h2>
          {articleList(results.filter((item) => item.category === id))}
        </section>
      )) : (
        <Empty>
          <p>Nenhum artigo encontrado.</p>
          <p>Tente outra palavra ou escolha uma categoria na página inicial da ajuda.</p>
          {modules.support && <Link className="text-action" to="/app/suporte">Abrir suporte</Link>}
        </Empty>
      )}
    </>
  ) : category ? (
    <>
      <Heading title={category.title}>{category.description}</Heading>
      {articleList(visible.filter((item) => item.category === category.id))}
    </>
  ) : (
    <>
      <Heading title="Como podemos ajudar?">Guias passo a passo para usar a plataforma. Busque por uma palavra ou escolha um assunto.</Heading>
      <Search label="Buscar na ajuda" placeholder="Buscar por palavra" onSearch={(query) => setParams(query ? { q: query } : {})} />
      {staff ? [false, true].map((team) => (
        <section className="help-group" key={String(team)}>
          <h2>{team ? "Para a equipe" : "Para alunos"}</h2>
          {categoryGrid(team)}
        </section>
      )) : <section className="help-group" aria-label="Assuntos">{categoryGrid(false)}</section>}
    </>
  );
  const content = (
    <div className="reading help" data-tour={member ? "help": undefined}>
      {!modules.help && !staff ? <ModuleUnavailable home={member ? "/app/cursos" : "/entrar"} /> : (
        <>
          {(member || artigo || category || q) && (
            <nav className="help-back" aria-label="Navegação da ajuda">
              {member && <Back to="/app/cursos" label="Voltar à área de membros" />}
              {(artigo || category || q) && <Back to={base} label="Central de ajuda" />}
            </nav>
          )}
          {!modules.help && <Notice>A Central de ajuda está desativada para os alunos. A equipe continua vendo os artigos.</Notice>}
          {!artigo ? index : locked ? (
            <>
              <Heading title="Entre para ler este artigo">Este artigo é para a equipe da plataforma e aparece só depois de entrar com a conta.</Heading>
              <div className="actions">
                <Link className="button primary" to={"/entrar?returnTo=" + encodeURIComponent("/app/ajuda/" + artigo)}>Entrar</Link>
                <Link className="button" to={base}>Ver todos os assuntos</Link>
              </div>
            </>
          ) : !article ? (
            <>
              <Heading title="Artigo não encontrado">O endereço pode ter mudado, ou o assunto não está ativo nesta plataforma.</Heading>
              <Link className="button" to={base}>Ver todos os assuntos</Link>
            </>
          ) : (
            // A chave remonta o artigo ao trocar de página, para uma resposta aberta não continuar aberta no seguinte.
            <article key={article.slug}>
              <p className="help-eyebrow"><Link to={`${base}?categoria=${article.category}`}>{categoryOf(article).title}</Link></p>
              <Heading title={article.title}>{article.summary}</Heading>
              {article.need && (
                <section className="help-need">
                  <h2>Antes de começar</h2>
                  <ul>{article.need.map((item, index) => <li key={index}>{rich(item)}</li>)}</ul>
                </section>
              )}
              {article.sections.map(({ title, intro, image, steps, list, warn, note }, position) => (
                <section className="help-section" key={title ?? position}>
                  {title && <h2>{title}</h2>}
                  {intro && <p>{rich(intro)}</p>}
                  {image && <Shot image={image} />}
                  {steps && (
                    <ol className="help-steps" role="list">
                      {steps.map((step, index) => {
                        const item = typeof step === "string" ? { text: step } : step;
                        return (
                          <li key={index}>
                            {rich(item.text)}
                            {item.image && <Shot image={item.image} />}
                            {item.note && <Callout>{rich(item.note)}</Callout>}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {list && <ul className="help-items">{list.map((item, index) => <li key={index}>{rich(item)}</li>)}</ul>}
                  {warn && <Callout warn>{rich(warn)}</Callout>}
                  {note && <Callout>{rich(note)}</Callout>}
                </section>
              ))}
              {article.trouble && (
                <section className="help-section">
                  <h2>Se algo não sair como esperado</h2>
                  {article.trouble.map(([question, answer], index) => (
                    <details className="help-trouble" key={index}>
                      <summary>{question}</summary>
                      <p>{rich(answer)}</p>
                    </details>
                  ))}
                </section>
              )}
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
            </article>
          )}
        </>
      )}
    </div>
  );
  return member ? content : <PublicFrame><QueryState query={context}>{content}</QueryState></PublicFrame>;
}
