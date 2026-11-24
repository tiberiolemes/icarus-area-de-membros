const dark = {
  course: "SaaS Marketing",
  position: 432,
  objective: "Estruturar a esteira de precificação com eixos de valor tangíveis, evitando canibalização de margens entre pacotes Pro e Enterprise.",
  subtitle: "Metodologias práticas para desenhar faixas de preços e monetizar retenção em expansão.",
  chapters: [
    ["01. Os 3 erros clássicos no tier inicial", 0],
    ["02. Decupando a Regra 3-Tier", 255],
    ["03. Expansão orgânica de ACV", 690],
    ["04. Resumo e Plano de Ação", 970],
  ],
  takeaways: [
    "Nunca cobre apenas por usuário. Associe assentos a métricas de consumo (armazenamento, API calls ou jobs executados) para permitir crescimento natural.",
    "Starter (âncora de entrada), Growth (onde reside a margem target de 80%) e Enterprise (customizado com SLA e suporte dedicado).",
  ],
  formula: ["Fórmula Central: Expansão de ACV", "Net ACV = (ARR_Base + Expansão) - (Churn + Contração)",
    "Um modelo saudável sustenta Net Retention Rate (NRR) acima de 115% através dos gatilhos de upgrade explicados no vídeo."],
  checklist: ["Auditar os 3 tiers vigentes", "Definir métrica secundária de valor", "Simular migração de coorte antiga"],
  cta: ["Comunidade VIP de Fundadores", "Tire dúvidas sobre pricing com mentores", "Entrar"],
  modules: [
    ["Fundamentos do SaaS", 4],
    ["Validação de Proposta", 5],
    ["Pricing & Embalagem", 4],
    ["Estratégias de Expansão", 2],
  ],
  lessons: [
    ["Psicologia de Preços B2B", 840],
    ["Aula 3.2: Arquitetura de Planos e Curva de Valor LTV", 1125],
    ["Mecanismos de Add-on e Upsell", 1260],
    ["Descontos Anuais vs Churn", 720],
  ],
};

const light = {
  course: "MKT para SaaS",
  position: 614,
  objective: "Compreender a relação matemática entre a barreira inicial de fricção (CAC) e os vetores de expansão por consumo ou assentos. O foco é desenhar 3 níveis com separação nítida de valor e limites de uso claros.",
  subtitle: "Metodologias práticas para desenhar faixas de preços que aceleram a retenção líquida e eliminam barreiras de upgrade no B2B.",
  chapters: [
    ["Fundamentos da Curva de Valor", 0],
    ["Mapeando Eixos de Precificação", 270],
    ["Arquitetura da Tríade de Planos", 614],
    ["Modelos de Expansão e NDR", 874],
  ],
  takeaways: [
    "O vetor principal de cobrança deve escalar conforme o cliente extrai valor real (ex: contatos ativos, requisições, eventos ou transações), nunca de forma punitiva.",
    "1. Starter: baixa barreira para validação rápida.\n2. Growth (Isca): o padrão com 70% das conversões.\n3. Enterprise: segurança e customização de alta margem.",
  ],
  formula: ["Fórmula Central", "NDR = [(ARR Início + Expansão - Contração - Churn) / ARR Início] × 100", "Expansão de ACV & Net Revenue Retention:"],
  checklist: ["Identificar a métrica primária de uso no SaaS", "Travar limites de plano sem gerar frustração precoce", "Simular impacto de 15% de expansão anual no LTV"],
  cta: ["Dúvidas na precificação?", "Tire dúvidas no grupo VIP de alunos.", "WhatsApp"],
  modules: [
    ["Product-Market Fit", 3],
    ["Canais de Aquisição CAC", 4],
    ["Pricing & Embalagem", 3],
    ["Expansão & Upsell", 3],
    ["Modelos Enterprise & SLA", 2],
    ["Pitch e Negociação", 1],
  ],
  lessons: [
    ["Anatomia da Demanda B2B", 840],
    ["Aula 3.2: Arquitetura de Planos e Curva de Valor LTV", 1125],
    ["Transição para Preço de Consumo", 1320],
  ],
};

export function mobileLesson(theme) {
  const data = theme === "dark" ? dark : light;
  const [label, expression, description] = data.formula;
  const [title, body, button] = data.cta;
  return {
    ...data,
    duration: data.lessons[1][1],
    lesson: data.lessons[1][0],
    presentation: {
      subtitle: data.subtitle,
      chapters: data.chapters.map(([title, start_seconds]) => ({ title, start_seconds })),
      takeaways: [
        { icon: "tune", title: "Eixos de Precificação", body: data.takeaways[0] },
        { icon: "layers", title: "A Regra do 3-Tier", body: data.takeaways[1] },
      ],
      formula: { label, reference: "SaaS-Metric-09", expression, description },
      checklist: data.checklist.map((label, index) => ({ id: `etapa-${index + 1}`, label })),
      cta: { title, body, button, url: "https://example.test/fixture" },
    },
    checkedIds: theme === "dark" ? ["etapa-1"] : ["etapa-1", "etapa-2"],
  };
}
