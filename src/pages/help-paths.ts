// Fica fora de help-content para o menu e o guia não carregarem o texto de todos os artigos.
const adminSettingsHelp: Record<string, string> = {
  onboarding: "perguntas-do-primeiro-acesso", marca: "marca-da-plataforma", certificado: "certificado-do-curso", modulos: "modulos", legal: "documentos-legais",
  equipe: "equipe-e-papeis", auditoria: "privacidade-e-auditoria", privacidade: "privacidade-e-auditoria",
};
const screenHelp: [RegExp, string][] = [
  [/^\/admin\/(dashboard|analytics)/, "dashboard-e-analytics"],
  [/^\/admin\/cursos\/[^/]+\/aulas\//, "apresentacao-da-aula"],
  [/^\/admin\/cursos/, "criar-curso"],
  [/^\/admin\/materiais/, "publicar-materiais"],
  [/^\/admin\/membros/, "membros"],
  [/^\/admin\/planos/, "planos"],
  [/^\/admin\/pedidos/, "pedidos"],
  [/^\/admin\/encontros/, "administracao-encontros"],
  [/^\/admin\/podcasts/, "administracao-podcasts"],
  [/^\/admin\/comunidade/, "moderar-comunidade"],
  [/^\/admin\/comentarios-aula/, "comentarios-de-aula"],
  [/^\/admin\/suporte/, "atender-chamados"],
  [/^\/admin\/feedbacks/, "administracao-feedback"],
  [/^\/admin/, "administracao"],
  [/^\/app\/cursos\/[^/]+\/[^/]+\/[^/]+/, "recursos-da-aula"],
  [/^\/app\/cursos/, "cursos"],
  [/^\/app\/materiais/, "materiais"],
  [/^\/app\/podcasts/, "podcasts"],
  [/^\/app\/certificados/, "certificados"],
  [/^\/app\/ranking/, "ranking"],
  [/^\/app\/encontros-ao-vivo/, "encontros"],
  [/^\/app\/notificacoes/, "notificacoes"],
  [/^\/app\/comunidade/, "comunidade"],
  [/^\/app\/suporte/, "suporte"],
];
const accountHelp: Record<string, string> = {
  notificacoes: "notificacoes", assinatura: "assinatura", seguranca: "verificacao-em-duas-etapas", privacidade: "privacidade",
};

/** Artigo que explica a tela aberta, para os links de ajuda do painel e do guia. */
export function helpPathFor(pathname: string, search = "") {
  const params = new URLSearchParams(search), tab = params.get("aba") ?? "";
  let slug = screenHelp.find(([route]) => route.test(pathname))?.[1];
  // Só chave própria do mapa: `?aba=constructor` não pode virar endereço de artigo.
  if (pathname === "/admin/configuracoes")
    slug = tab === "integracoes" ? params.get("provedor") === "bunny" ? "integracao-bunny" : "integracao-asaas"
      : Object.hasOwn(adminSettingsHelp, tab) ? adminSettingsHelp[tab] : "perguntas-do-primeiro-acesso";
  if (pathname === "/app/configuracoes") slug = Object.hasOwn(accountHelp, tab) ? accountHelp[tab] : "conta";
  return slug ? "/ajuda/" + slug : "/ajuda";
}
