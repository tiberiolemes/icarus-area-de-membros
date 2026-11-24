export const lessonObjective = '<p>Nesta sessão analítica, desconstruímos os modelos antiquados de Precificação por Usuário ("Per-Seat") e introduzimos a mecânica de <strong>Value Metric Pricing</strong>. Aprenda a calibrar faixas de planos alinhadas ao momento de escala do cliente corporativo e a eliminar churn involuntário decorrente de paywalls punitivos.</p>';
export const initialLessonChecklist = ["upgrade", "wtp"];

/** @param {boolean} dark @returns {import("../../../src/pages/lesson-presentation").Presentation} */
export function lessonPresentation(dark) {
  return {
    subtitle: dark ? undefined : "Metodologias práticas para desenhar faixas de preços que aceleram a retenção líquida e eliminam barreiras de upgrade no B2B.",
    chapters: dark ? undefined : [
      { title: "Introdução e falhas do modelo per-seat", start_seconds: 0, duration_seconds: 135 },
      { title: "O conceito de Value Metric primária", start_seconds: 270, duration_seconds: 400 },
      { title: "Arquitetura Good-Better-Best", start_seconds: 614, duration_seconds: 260 },
      { title: "Simulação prática de expansão de ACV", start_seconds: 874, duration_seconds: 251 },
    ],
    takeaways: [
      {
        icon: "tune", title: "Eixos de Precificação",
        body: "Identifique a métrica que escala naturalmente quando seu cliente obtém valor tangível (ex: transações processadas, volume de eventos, contatos qualificados).",
      },
      {
        icon: "layers", title: "A Regra do 3-Tier",
        body: "Estruturação dos tiers Starter, Growth e Enterprise. Como ancorar visualmente o plano intermediário para obter 70%+ de conversão primária.",
      },
    ],
    formula: {
      label: "Fórmula Central: Expansão de ACV",
      reference: "SaaS-Metric-09",
      expression: "NDR (Net Dollar Retention) = [(ARR Início + Expansão - Contração - Churn) / ARR Início] × 100",
      description: "A precificação de valor sustentável deve assegurar que sua retenção líquida de receita anual supere 115% sem necessidade de aquisição de novos logos.",
    },
    checklist: [
      { id: "upgrade", label: "Mapear as 3 principais fricções no upgrade de planos atuais da sua base de usuários." },
      { id: "wtp", label: "Calcular o Willingness-to-Pay (WTP) através da metodologia Van Westendorp com 15 clientes ativos." },
      { id: "transicao", label: "Definir o gatilho de transição entre o autosserviço (Self-serve) e o contato assistido (Sales-assisted)." },
    ],
    cta: {
      label: dark ? "Canal Direto" : "Canal Direto de Networking",
      context: dark ? "Mentores & Colegas" : "Mentores & Colegas Fundadores",
      title: dark ? "Dúvidas sobre a arquitetura do seu SaaS?" : "Dúvidas sobre a arquitetura de planos do seu SaaS?",
      body: "Participe do grupo exclusivo de WhatsApp dos alunos para discutir cenários reais com os professores e fundadores de software.",
      button: dark ? "Entrar no WhatsApp" : "Entrar no Grupo WhatsApp",
      url: "https://example.test/fixture",
    },
  };
}
