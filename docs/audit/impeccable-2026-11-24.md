# Revisão de interface com Impeccable · 24/11/2026

Revisão do Icarus com capturas em Chromium a 360 e 1280 px. O detector do Impeccable avaliou cada cenário e o axe verificou contraste, nomes acessíveis, rótulos, semântica e hierarquia nas páginas da aplicação a 360 px. Telas autenticadas foram abertas nos temas claro e escuro. A avaliação aplica o Design System do Icarus e mantém Inter auto-hospedada.

## Cobertura

| Área | Cenários | Superfícies |
| --- | ---: | --- |
| Pública | 17 | Acesso, cadastro, recuperação, redefinição, confirmação, callback, documentos legais, ajuda, checkout, acompanhamento, certificado, verificação e página indisponível |
| Membros | 27 | Onboarding, vitrine, curso, módulo, aula privada e prévia, materiais, podcasts, certificados, ranking, encontros, notificações, seis abas de conta, fórum, publicação, edição, suporte e página indisponível |
| Administração | 29 | Cursos, currículo, apresentação da aula, materiais, membros, encontros, podcasts, feedbacks, métricas, planos, pedidos, comunidade, moderação de aulas, suporte, oito estados de configurações e página indisponível |
| Demonstração | 19 | Acesso, vitrine, ementa, aula, materiais, certificados, comunidade, chamados, painel, criação e edição de curso, moderação e estados de acesso restrito e conteúdo indisponível |

## Correções verificadas

| Gravidade | Superfície | Correção |
| --- | --- | --- |
| P1 | Catálogo, Conta, Suporte, Pedidos e Configurações da plataforma | Restabelecido o contraste dos filtros e das abas no escuro com tokens do tema. |
| P1 | Currículo e Conteúdo | Aumentado o contraste dos metadados na aula escura e dos textos auxiliares na administração clara. |
| P2 | Navegação da equipe | Administração aparece para admin. Instrutores, moderadores e suporte acessam suas ferramentas pelo próprio atalho. A suíte cobre os cinco papéis em menu e gaveta. |
| P2 | Catálogo, onboarding e aula | Incluído o título de seção da vitrine. Ajustados os rótulos da navegação móvel, do onboarding e do vídeo. |
| P2 | Páginas públicas, suporte, certificados e fichas administrativas | Simplificados os avisos e as molduras sobrepostas. Aumentado o alvo do link de retorno no checkout e o espaço do estado vazio de pedidos. |
| P3 | Aplicação e demonstração | Melhorada a quebra de títulos e textos. Na demo, ajustados o contraste do campo de busca e a hierarquia de chamados, cursos e certificados. |

## Parecer

| Dimensão | Pontuação | Evidência |
| --- | ---: | --- |
| Acessibilidade | 3/4 | Contraste, títulos e nomes acessíveis verificados nos estados auditados. Leitor de tela e dispositivo físico ficam fora do ensaio. |
| Desempenho | 3/4 | Rotas carregadas sob demanda, mídia de lista com carregamento adiado e demo sem requisições externas no fluxo testado. Métricas de campo ficam fora do ensaio. |
| Temas | 4/4 | Tokens oficiais e reteste de contraste em claro e escuro nos estados autenticados disponíveis. |
| Responsividade | 3/4 | Capturas sem rolagem horizontal na página a 360 e 1280 px, com navegação móvel verificada por teclado em fluxos selecionados. |
| Coerência da implementação | 3/4 | Mantidos componentes, tokens e os dois papéis simulados da demo. Inter, a área editável do editor rico e as amostras claro/escuro de marca são escolhas funcionais do produto. |
| **Total** | **16/20** | Pontuação restrita à evidência desta rodada. |

Passaram a compilação, os 256 testes de interface e a jornada de demonstração no Chrome com aluno, administrador e abertura offline. A revisão independente conferiu os atalhos de equipe, a cascata de estilos e a preservação dos controles de acesso. A evidência desta linha se refere à versão de demonstração do PR #3. A [demonstração atual](../../README.md#demonstração-navegável) é compilada das telas da aplicação.

O banco local forneceu conteúdo de demonstração e estados indisponíveis. A discussão sem publicação disponível e o pedido sem registro foram verificados nesse estado. Checkout e integrações externas foram vistos sem a configuração do provedor. A evidência cobre as rotas e os estados acima.
