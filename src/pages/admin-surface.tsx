import { Fragment, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { HelpLink } from "../help-link";
import { FormHeadingTarget, Heading } from "../ui";
import { helpPathFor } from "./help-paths";
import "./admin-settings.css";

/** Página padrão do painel (classe admin-settings): trilha, título, descrição, ação à direita, abas e cartões. */
export function AdminSurface({ section, trail, title, description, action, tabs, children, className = "", formAction = false }: {
  section: string;
  trail: (string | { label: string; to: string })[];
  className?: string;
  title: string;
  description: string;
  action?: ReactNode;
  formAction?: boolean;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const { pathname, search } = useLocation();
  return (
    <div className={`admin-settings ${className}`} data-section={section}>
      <p className="settings-breadcrumb">
        {trail.map((item, index) => (
          <Fragment key={index}>
            {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
            {typeof item === "string" ? <span aria-current={index === trail.length - 1 ? "page" : undefined}>{item}</span> : <Link to={item.to}>{item.label}</Link>}
          </Fragment>
        ))}
      </p>
      <Heading title={title} action={formAction ? <div className="editor-actions">{action}<div className="heading-submit" ref={setTarget} /></div> : action}>{description}</Heading>
      {tabs}
      <FormHeadingTarget.Provider value={target}>{children}</FormHeadingTarget.Provider>
      <HelpLink className="button settings-help" to={helpPathFor(pathname, search)}>Ajuda da administração</HelpLink>
    </div>
  );
}
