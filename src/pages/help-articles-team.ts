import type { HelpArticle } from "./help-content";

/** Artigos da equipe. Rótulos em negrito são os da tela: ao mudar uma tela, ajuste aqui. */
export const teamArticles: HelpArticle[] = [
  {
    slug: "administracao",
    category: "painel",
    title: "Conhecer o painel de administração",
    summary: "O painel é onde a equipe cria o conteúdo, cuida dos membros e ajusta a plataforma. Cada pessoa vê só as áreas do seu papel.",
    sections: [
      {
        title: "Entrar no painel",
        steps: [
          "Entre na plataforma com a sua conta da equipe.",
          "Abra o menu e vá até o fim, logo abaixo de **Configurações**. No celular, toque antes no botão de menu no topo.",
          "Clique no atalho do seu papel. Ele se chama **Administração** para administradores, **Painel de conteúdo** para instrutores, **Moderação** para moderadores e **Atendimento** para a equipe de suporte.",
        ],
        note: "Para voltar à visão do aluno, clique em **Área do aluno** no rodapé do menu do painel.",
      },
      {
        title: "O que há em cada grupo do menu",
        list: [
          "**Visão geral** traz o **Dashboard** e o **Analytics**.",
          "**Conteúdo** reúne **Cursos e aulas** e **Materiais**.",
          "**Alunos e vendas** tem **Membros**, **Planos** e **Pedidos**.",
          "**Engajamento** concentra **Encontros ao vivo**, **Podcasts**, **Comunidade** e **Comentários de aula**.",
          "**Operações** traz **Suporte** e **Feedbacks dos alunos**.",
          "**Configurações** fica no fim do menu e guarda os ajustes da plataforma.",
        ],
      },
      {
        title: "Achar uma área pelo nome",
        steps: [
          "Clique na lupa **Buscar no painel**, no topo.",
          "Digite parte do nome em **Nome da área**.",
          "Clique no resultado.",
        ],
      },
      {
        title: "Pedir ajuda dentro de cada tela",
        list: [
          "**Guia desta tela**, no topo, destaca as partes principais da página e explica o que elas fazem. Em algumas telas, ele mostra só o menu.",
          "**Ajuda da administração**, no fim de cada página, abre o artigo sobre aquela tela.",
        ],
      },
      {
        title: "Hábitos de quem administra",
        list: [
          "Salve antes de trocar de aba ou fechar um editor. Alguns editores descartam o que não foi salvo sem avisar.",
          "A sessão da equipe termina depois de 30 minutos sem uso. Um minuto antes aparece o botão **Continuar conectado**.",
          "Quem usa a verificação em duas etapas e marca **Lembrar por 15 dias** ao entrar fica conectado por 15 dias, sem o limite de 30 minutos.",
          "Ações delicadas pedem a sua senha de novo. É uma proteção, e cada confirmação vale para uma ação.",
          "Ative a [verificação em duas etapas](/ajuda/verificacao-em-duas-etapas). Ela é exigida para mexer nas integrações.",
        ],
      },
      {
        title: "Quando um módulo está desligado",
        intro: "O item do menu ganha o selo **Desativado** e o topo da tela avisa que os alunos não veem aquele recurso. Você continua podendo preparar o conteúdo. Para religar, um administrador usa a [aba Módulos das Configurações](/ajuda/modulos).",
      },
      {
        title: "Quando sai uma versão nova",
        intro: "Administradores veem no topo do painel um aviso com o número da versão nova.",
        list: [
          "**Notas da versão** mostra o que mudou.",
          "**Como atualizar** abre o roteiro de atualização. Faça backup antes de atualizar.",
          "**Dispensar esta versão** esconde o aviso até a próxima versão, só neste navegador.",
        ],
      },
    ],
    trouble: [
      ["Aparece Acesso restrito", "Aquela tela não faz parte do seu papel. Peça a um administrador para rever o seu papel na ficha de membro."],
      ["O atalho do painel não aparece no menu", "A conta está com o papel de membro. Um administrador precisa alterar o papel em **Membros**."],
    ],
    related: ["equipe-e-papeis", "criar-curso", "integracoes"],
  },
  {
    slug: "equipe-e-papeis",
    category: "painel",
    title: "Definir quem faz o quê na equipe",
    summary: "O papel de cada pessoa decide o que ela enxerga no painel. Dê a cada um só o que o trabalho pede.",
    sections: [
      {
        title: "Os papéis",
        list: [
          "**Administrador** cuida de tudo, inclusive configurações, equipe, vendas e auditoria.",
          "**Instrutor** cria e publica cursos, aulas e materiais.",
          "**Moderador** aprova publicações, respostas e comentários de aula e trata denúncias.",
          "**Suporte** responde aos chamados dos alunos.",
          "**Membro** é o aluno, sem acesso ao painel.",
        ],
        warn: "Papel e plano são coisas diferentes. O papel libera ferramentas do painel. Administradores e instrutores abrem todos os cursos, aulas e materiais sem plano, inclusive os rascunhos. Moderadores e suporte seguem as regras de acesso como qualquer aluno. Se precisarem assistir a um curso restrito, dê a eles um [plano como cortesia](/ajuda/membros).",
      },
      {
        title: "Consultar os papéis",
        steps: [
          "No painel, clique em **Configurações**.",
          "Abra a aba **Equipe**.",
          "Clique em **Gerenciar membros e equipe** para ver quem tem cada papel.",
        ],
      },
      {
        title: "Mudar o papel de alguém",
        intro: "A pessoa precisa ter uma conta na plataforma antes. A mudança encerra as sessões dela. No próximo acesso, ela já entra com o papel novo.",
        steps: [
          "Em **Membros**, clique em **Abrir ficha** na linha da pessoa.",
          "Em **Alterar acesso**, escolha o novo **Papel**.",
          "Escreva o **Motivo obrigatório** e clique em **Revisar alteração**.",
          "Confira o resumo em **Confirme a alteração** e clique em **Autorizar alteração crítica**.",
          "Digite a sua **Senha atual** e clique em **Confirmar e executar**.",
        ],
      },
    ],
    trouble: [
      ["Não consigo tirar o meu próprio papel de administrador", "É uma trava para a plataforma nunca ficar sem administrador. Outra conta administradora precisa fazer a mudança."],
    ],
    related: ["membros", "privacidade-e-auditoria", "administracao"],
  },
  {
    slug: "dashboard-e-analytics",
    category: "painel",
    title: "Acompanhar os números no Dashboard e no Analytics",
    summary: "O Dashboard resume vendas, aprendizado e atendimento. O Analytics mostra onde os alunos avançam e onde param em cada curso.",
    sections: [
      {
        title: "Abrir o Dashboard",
        steps: [
          "No painel, clique em **Dashboard**.",
          "Clique no botão de período. Ele começa em **Mês atual**.",
          "Escolha um atalho. Para um intervalo próprio, escolha **Personalizado**, informe as datas e clique em **Aplicar**.",
        ],
      },
      {
        title: "Ler os indicadores",
        intro: "As datas seguem o horário de Brasília e incluem o último dia do período. Cortesias não entram em receita nem em ativações.",
        list: [
          "**MRR equivalente** é a receita recorrente mensal. Soma o valor mensal das assinaturas pagas que estão valendo agora e não muda com o período.",
          "**Receita de pedidos** soma os pedidos pagos no período.",
          "**Vencimentos em 30 dias** conta os membros com acesso pago a vencer nos próximos 30 dias.",
          "**Membros novos e ativações pagas** compara quem chegou com quem começou a pagar.",
          "**Progresso da aprendizagem** mostra as conclusões de aula.",
          "**Suporte ao aluno** e **Comunidade** resumem chamados e publicações.",
          "**Pagamentos por método** separa Pix de cartão.",
        ],
      },
      {
        title: "Analisar um curso no Analytics",
        steps: [
          "Clique em **Analytics** no menu, ou em **Analisar cursos** dentro do Dashboard.",
          "Em **Curso selecionado**, escolha um curso publicado.",
          "Veja em **Jornada curricular** quantos alunos começaram, concluíram o primeiro módulo e terminaram o curso.",
          "Em **Diagnóstico por aula**, compare a taxa de conclusão de cada aula.",
        ],
        note: "Uma aula com conclusão bem abaixo das vizinhas merece uma revisão.",
      },
    ],
    trouble: [
      ["O Analytics diz que não há curso disponível", "Só cursos publicados entram na lista. Publique um curso e ele aparece em **Curso selecionado**."],
      ["O curso aparece, mas os números ficam zerados", "Ainda não há progresso de alunos. As contas da equipe ficam fora do cálculo, então assistir às aulas com a sua conta não muda os números."],
    ],
    related: ["pedidos", "membros"],
  },
  {
    slug: "criar-curso",
    category: "conteudo",
    title: "Criar um curso do zero",
    summary: "Um curso é feito de módulos, e cada módulo tem as suas aulas. Seções são opcionais e servem para agrupar aulas dentro de um módulo. Publique quando tudo estiver no lugar.",
    need: [
      "Uma conta de administrador ou instrutor.",
      "O título e a descrição do curso.",
      "Os vídeos das aulas, em arquivo MP4 ou já enviados ao Bunny Stream.",
      "Os planos já criados, se o curso for restrito a alguns deles.",
    ],
    sections: [
      {
        title: "Criar o curso",
        steps: [
          "No painel, clique em **Cursos e aulas**.",
          "Clique em **Criar curso**.",
          {
            text: "Preencha o **Título**.",
            note: "O **Endereço (slug)**, que é o trecho do link do curso, é montado sozinho a partir do título, como em `marketing-do-zero`. Só mexa se quiser outro endereço. O campo aceita letras minúsculas, números e hífens e corrige na hora o que você digitar ou colar. Depois que o curso é salvo, trocar o título não muda o endereço.",
          },
          "Escreva a **Descrição do curso**.",
          "Deixe o **Estado** em **Rascunho** por enquanto.",
          "Escolha a **Regra de acesso**.",
          "Clique em **Criar curso**, no topo da página. As abas **Estrutura e aulas** e **Certificado** são liberadas.",
        ],
      },
      {
        title: "Entender a regra de acesso",
        list: [
          "**Todos os membros** libera o curso para qualquer conta ativa.",
          "**Assinatura ativa** exige um plano em vigor, seja qual for.",
          "**Planos selecionados** exige um dos planos marcados em **Planos permitidos quando restrito**.",
          "**Herdar do curso** aparece só no módulo e é o padrão dele. Se você escolher outra opção no módulo, o aluno precisa atender à regra do curso e também à do módulo. Seções e aulas não têm regra própria.",
        ],
        warn: "Escolheu **Planos selecionados**? Marque pelo menos um plano. Sem nenhum marcado, nenhum aluno consegue entrar.",
      },
      {
        title: "Enviar a capa e ajustar o corte",
        intro: "A capa aparece na lista de cursos, na página do curso e no início da aula em vídeo. Cada lugar tem um formato, então a mesma imagem é recortada de jeitos diferentes.",
        steps: [
          "Na aba **Curso**, encontre **Capa do curso**.",
          "Clique em **Escolher arquivo** e selecione uma imagem PNG, JPG ou WebP de até 20 MB. O ideal é uma imagem deitada, de 1600\u00a0×\u00a0900\u00a0px. A plataforma otimiza a imagem no envio, sem perda visível, e só a versão otimizada, de até 500 KB, é guardada.",
          "Clique em **Enviar arquivo** e espere a mensagem **Arquivo enviado e associado ao registro**.",
          "Role até **Como a capa aparece** e confira as três prévias. **Lista de cursos e aula** mostra a imagem quase inteira. **Página do curso** corta as laterais. **Página do curso no tablet** corta o topo e a base.",
          "Se uma prévia cortar algo importante, vá até **Foco do corte** e clique na imagem, no ponto que precisa aparecer sempre. As prévias mudam na hora.",
          "Clique em **Salvar foco** e espere a mensagem **Foco salvo**.",
        ],
        list: [
          "**Foco horizontal** e **Foco vertical** fazem o mesmo ajuste do clique, também pelo teclado.",
          "O foco fica guardado no curso. Depois de trocar a capa, confira as prévias de novo.",
          "A capa é opcional. Sem ela, o curso aparece na lista com um cartão escuro e o título.",
        ],
        note: "Título e rostos perto das bordas costumam ser cortados na página do curso, nas laterais no computador e no topo e na base no tablet. Deixe o que importa mais ao centro da arte, ou leve o foco até ele.",
      },
      {
        title: "Montar a estrutura",
        steps: [
          "Abra a aba **Estrutura e aulas**.",
          "Clique em **Adicionar módulo**. Preencha o **Título** e clique em **Salvar conteúdo**.",
          "Dentro do módulo, clique em **Adicionar aula**. Preencha **Título** e **Duração em segundos** e clique em **Salvar conteúdo**.",
          "Repita para as demais aulas e módulos.",
        ],
        list: [
          "O **Endereço (slug)** do módulo e da aula também é montado sozinho a partir do título. Seções não têm endereço.",
          "**Posição na lista** define a ordem. Use 0 para o primeiro item, 1 para o segundo e assim por diante. Se todos ficarem em 0, a ordem não segue a de criação, e você arruma com **Reordenar**.",
        ],
      },
      {
        title: "Agrupar aulas em seções",
        intro: "Seções são opcionais. Use quando um módulo tiver muitas aulas e ficar mais claro dividi-las em blocos, como Teoria e Prática.",
        steps: [
          "Dentro do módulo, clique em **Adicionar seção**. Preencha o **Título** e clique em **Salvar conteúdo**.",
          "Dentro da seção, clique em **Adicionar aula**.",
          "Preencha **Título** e **Duração em segundos** e clique em **Salvar conteúdo**.",
        ],
        list: [
          "As aulas criadas direto no módulo aparecem antes das seções, sem título de seção.",
          "Depois de criada, a aula não troca de seção nem passa do módulo para uma seção. Para mudar, crie a aula de novo no lugar certo e [arquive](/ajuda/arquivar-conteudo) a antiga.",
        ],
      },
      {
        title: "Opções de cada aula",
        list: [
          "**Tipo de aula** define se ela é **Vídeo** ou **Texto**. O conteúdo da aula de texto é escrito em **Descrição da aula**.",
          "**Duração em segundos** soma na carga horária do certificado. Uma aula de 10 minutos tem 600 segundos.",
          "**Aula de prévia liberada aos membros** abre a aula para qualquer membro, mesmo sem plano.",
          "**Obrigatória para o certificado** coloca a aula na lista exigida para o certificado. Ela já vem marcada em aulas novas.",
          "**Seção bônus**, no editor da seção, tira as aulas dela da exigência do certificado. Para ter aulas bônus, crie uma seção só para elas.",
        ],
        note: "Para anexar um arquivo a uma aula, cadastre o material em [Publicar materiais para download](/ajuda/publicar-materiais) e escolha a **Aula vinculada**.",
      },
      {
        title: "Mudar a ordem",
        steps: [
          "Clique em **Reordenar**.",
          "Use as setas para cima e para baixo ao lado de cada item.",
          "Clique em **Reordenar** de novo para sair do modo de ordenação.",
        ],
      },
      {
        title: "Conferir e publicar",
        steps: [
          "Clique em **Prévia autorizada** para conferir a aparência do curso. A prévia mostra tudo para a equipe, inclusive o que está em **Rascunho**, e libera as aulas mesmo sem plano.",
          "Em cada aula, módulo e seção, clique no lápis, mude o **Estado** para **Publicado** e clique em **Salvar conteúdo**.",
          "Volte à aba **Curso**, mude o **Estado** para **Publicado** e clique em **Salvar curso**.",
          "Entre com uma conta de membro para ver o curso como o aluno vê. A prévia não serve para isso, porque mostra também os rascunhos.",
        ],
        warn: "O aluno só enxerga uma aula quando a aula, o módulo e o curso estão em **Publicado**. Se a aula estiver em uma seção, a seção também precisa estar. Se algo não aparecer, confira cada um. A seção não mostra o estado na lista, então abra o lápis dela para conferir.",
        note: "Para poupar trabalho, escolha **Publicado** já ao criar módulos, seções e aulas. Enquanto o curso estiver em **Rascunho**, nada aparece para o aluno.",
      },
    ],
    trouble: [
      ["Aparece o aviso de que já existe um registro com esses dados", "O **Endereço (slug)** já está em uso. Escreva outro no campo e salve de novo."],
      ["As aulas aparecem fora de ordem", "Os itens ficaram com a mesma **Posição na lista**. Clique em **Reordenar** e arrume com as setas."],
      ["Aparece o aviso de que, mesmo otimizada, a imagem passa de 500 KB", "É raro e costuma acontecer com arte muito detalhada. Exporte a arte de novo com 1600\u00a0×\u00a0900\u00a0px, em JPG ou WebP, e envie outra vez. Se o aviso for de arquivo acima de 20 MB, reduza a imagem antes de escolher."],
      ["A capa aparece cortada na página do curso", "No computador, a página do curso mostra a capa em um quadro quase quadrado, que corta as laterais. No tablet, ela vira uma faixa larga, que corta o topo e a base. Em **Capa do curso**, clique na imagem, no ponto que precisa aparecer, e depois em **Salvar foco**."],
      ["O curso não publica e cita o certificado", "Com o certificado ligado, o curso precisa do responsável preenchido e de pelo menos uma aula obrigatória publicada, com duração e que não seja de prévia. Veja [Configurar o certificado do curso](/ajuda/certificado-do-curso)."],
      ["Perdi o que estava digitando", "Trocar de aba ou fechar o editor descarta o que não foi salvo. Clique em **Salvar conteúdo** antes de sair."],
      ["Não acho o botão de excluir", "Não existe exclusão. O caminho é [arquivar](/ajuda/arquivar-conteudo), que tira do ar e pode ser desfeito."],
    ],
    related: ["video-da-aula", "apresentacao-da-aula", "certificado-do-curso", "publicar-materiais"],
  },
  {
    slug: "video-da-aula",
    category: "conteudo",
    title: "Colocar vídeo em uma aula",
    summary: "Há três caminhos. Você pode enviar o arquivo direto para a plataforma, hospedar o vídeo no Bunny Stream e informar o código dele, ou colar o link de um vídeo do YouTube.",
    sections: [
      {
        title: "Qual caminho escolher",
        list: [
          "**Arquivo de vídeo** é o mais simples. Serve para arquivos MP4 de até 500 MB e dispensa qualquer integração. O envio precisa terminar em até 15 minutos, o que pede uma boa conexão para arquivos grandes.",
          "**Bunny Stream** recebe o código de um vídeo hospedado lá. É o caminho indicado para muitos vídeos ou arquivos grandes, e exige a [integração com o Bunny](/ajuda/integracao-bunny), configurada por um administrador.",
          "**YouTube** recebe o link de um vídeo publicado lá. Não precisa de integração. O vídeo toca dentro da aula, mas continua no YouTube.",
        ],
        warn: "O campo **Vídeo do Bunny ou link do YouTube** tem prioridade. Com qualquer valor nele, a plataforma ignora o arquivo enviado.",
      },
      {
        title: "Enviar um arquivo MP4",
        steps: [
          "Em **Cursos e aulas**, abra o curso e a aba **Estrutura e aulas**.",
          "Clique no lápis da aula. A aula precisa já ter sido salva uma vez.",
          "Em **Mídia da aula**, deixe o **Tipo de aula** em **Vídeo**.",
          "Em **Arquivo de vídeo**, clique em **Escolher arquivo** e selecione o MP4.",
          "Clique em **Enviar arquivo** e não feche o editor nem troque de aba do curso até aparecer **Arquivo enviado e associado ao registro**.",
          "Preencha a **Duração em segundos** e clique em **Salvar conteúdo**.",
        ],
        warn: "O envio precisa terminar em até 15 minutos. Em conexão lenta, um arquivo grande não chega a tempo e aparece o aviso de prazo expirado. Nesse caso, reduza o arquivo ou use o Bunny Stream.",
      },
      {
        title: "Usar um vídeo do Bunny Stream",
        steps: [
          "No Bunny, copie o código do vídeo, chamado **Video ID**. Ele tem 36 caracteres, com letras, números e hífens.",
          "No editor da aula, cole o código em **Vídeo do Bunny ou link do YouTube**.",
          "Preencha a **Duração em segundos** e clique em **Salvar conteúdo**.",
        ],
      },
      {
        title: "Usar um vídeo do YouTube",
        steps: [
          "No YouTube, abra o vídeo e copie o link da barra de endereço ou do botão **Compartilhar**.",
          "No editor da aula, cole o link em **Vídeo do Bunny ou link do YouTube**.",
          "Preencha a **Duração em segundos** e clique em **Salvar conteúdo**. A plataforma guarda só o código do vídeo e, ao reabrir a aula, mostra o link de novo.",
        ],
        warn: "A plataforma só mostra o vídeo a quem tem acesso à aula, mas ele continua no YouTube. Um vídeo **Não listado** abre para qualquer pessoa que tenha o link, e um **Privado** não toca dentro da aula. Para conteúdo pago, prefira o Bunny Stream ou o arquivo enviado.",
      },
      {
        title: "Conferir",
        steps: [
          "Reabra a aula pelo lápis e clique em **Prévia autorizada da aula**.",
          "Veja se o vídeo toca do começo ao fim.",
        ],
      },
    ],
    trouble: [
      ["O campo de arquivo não aparece", "Ele só surge em aula já salva. Clique em **Salvar conteúdo**, reabra a aula pelo lápis e o campo estará lá."],
      ["O arquivo foi recusado", "Só MP4 de até 500 MB é aceito. Converta o vídeo ou reduza a qualidade na exportação."],
      ["Aparece o aviso de prazo do upload expirado", "O envio passou de 15 minutos, e o arquivo não foi associado à aula. Reduza o arquivo ou use o Bunny Stream. Depois, envie de novo."],
      ["O aluno vê que não foi possível carregar o vídeo", "No caminho do Bunny, confira se o código foi colado inteiro e se a integração está como **Configurado**. O editor não avisa quando o código está errado, então teste sempre pela prévia. No caminho do YouTube, confira se o vídeo está como **Público** ou **Não listado** e se a incorporação está permitida. No caminho do arquivo, confira se **Vídeo do Bunny ou link do YouTube** está vazio."],
      ["Aparece o aviso para colar um link do YouTube ou o ID do Bunny", "O campo aceita só esses dois formatos. Links de outras plataformas, como Vimeo, não funcionam."],
    ],
    related: ["criar-curso", "integracao-bunny", "apresentacao-da-aula"],
  },
  {
    slug: "apresentacao-da-aula",
    category: "conteudo",
    title: "Montar a apresentação da aula",
    summary: "A apresentação enriquece a aba Descrição com capítulos clicáveis, destaques, uma fórmula, um checklist e uma chamada final.",
    sections: [
      {
        title: "Abrir o editor",
        steps: [
          "Na aba **Estrutura e aulas**, clique no lápis de uma aula já salva.",
          "Clique em **Editar apresentação**.",
        ],
      },
      {
        title: "O que dá para adicionar",
        list: [
          "**Subtítulo (opcional)** aparece logo abaixo do título da aula.",
          "**Capítulos** dividem o vídeo em trechos. O aluno clica e vai direto ao ponto.",
          "**Destaques** são cartões com as ideias principais.",
          "**Fórmula** apresenta um método ou uma conta em evidência.",
          "**Checklist** vira a lista de tarefas que o aluno marca.",
          "**Chamada para ação** fecha a aula com um botão para o WhatsApp. O link precisa ser oficial do WhatsApp, como os que começam com `https://wa.me/`.",
        ],
      },
      {
        title: "Cadastrar capítulos",
        steps: [
          "Em **Capítulos**, clique em **Adicionar capítulo**.",
          "Preencha o **Título do capítulo**.",
          "Em **Início em segundos**, informe onde o trecho começa. O minuto 2:30 é o segundo 150.",
          "Repita para os demais, sempre em ordem crescente.",
        ],
      },
      {
        title: "Salvar",
        steps: ["Clique em **Salvar apresentação**, no topo. O botão só fica ativo quando há mudança."],
        warn: "Remover um item do **Checklist** e salvar apaga as marcações que os alunos já fizeram nele. Editar o texto ou mudar a ordem preserva as marcações.",
      },
    ],
    trouble: [
      ["Aparece um erro no início do capítulo", "Cada capítulo precisa começar depois do anterior. Confira se os segundos estão em ordem crescente."],
    ],
    related: ["criar-curso", "video-da-aula"],
  },
  {
    slug: "certificado-do-curso",
    category: "conteudo",
    title: "Configurar o certificado do curso",
    summary: "Com o certificado ligado, o documento é emitido automaticamente quando o aluno conclui as aulas obrigatórias. Quem assina vem do modelo global ou de dados só daquele curso.",
    sections: [
      {
        title: "Definir o modelo global",
        intro: "O modelo vale para todo curso em **Usar o modelo global**. Só administradores editam o modelo.",
        steps: [
          "No painel, clique em **Configurações** e abra a aba **Certificado**.",
          "Preencha **Nome do responsável** e **Cargo do responsável**. São os dados de quem assina.",
          "Clique em **Salvar modelo**.",
          "No cartão **Assinatura**, clique em **Escolher assinatura**.",
          "Selecione um PNG com fundo transparente de até 500 KB. O tamanho recomendado é 600 × 200 px.",
          "Clique em **Salvar assinatura**.",
        ],
        warn: "A imagem da assinatura fica pública no certificado. Use uma rubrica feita para isso, nunca a assinatura que você usa em contratos.",
        note: "Mudar o modelo vale para os próximos certificados de todos os cursos que usam o modelo. Os já emitidos não mudam.",
      },
      {
        title: "Ligar o certificado no curso",
        steps: [
          "Em **Cursos e aulas**, abra o curso e a aba **Certificado**.",
          "Marque **Emitir certificado após as aulas obrigatórias**.",
          "Em **Responsável e assinatura**, deixe marcado **Usar o modelo global**. Todo curso novo começa assim.",
          "Confira o nome, o cargo e a assinatura do modelo, que aparecem logo abaixo.",
          "Clique em **Salvar configuração do certificado**.",
        ],
      },
      {
        title: "Personalizar só um curso",
        intro: "Use quando outra pessoa assina o certificado daquele curso.",
        steps: [
          "Na aba **Certificado** do curso, marque **Personalizar só este curso**. Os campos chegam preenchidos com o modelo.",
          "Edite **Nome do responsável** e **Cargo do responsável**.",
          "Clique em **Salvar configuração do certificado**.",
          "Se você for administrador, envie a assinatura do curso no cartão **Assinatura**. Clique em **Escolher assinatura** e depois em **Salvar assinatura**.",
        ],
        note: "Para voltar ao padrão, marque **Usar o modelo global** e salve. A assinatura própria do curso fica guardada e volta se você personalizar de novo.",
      },
      {
        title: "O que precisa estar pronto para emitir",
        list: [
          "Pelo menos uma aula marcada como **Obrigatória para o certificado**, publicada e que não seja **Aula de prévia liberada aos membros**.",
          "A seção e o módulo dessa aula em **Publicado**. A seção não pode ser **Seção bônus**.",
          "**Duração em segundos** preenchida nas aulas obrigatórias. A soma vira a carga horária.",
          "Nome e cargo do responsável preenchidos, no modelo global ou no curso.",
        ],
      },
      {
        title: "O que o certificado mostra",
        list: [
          "O nome completo do aluno, o curso e a carga horária.",
          "A data de emissão e um código de verificação.",
          "O nome da plataforma em **Emitido por**, a assinatura e o responsável.",
        ],
        warn: "Certificados já emitidos não mudam. Uma alteração aqui só vale para os próximos.",
      },
    ],
    trouble: [
      ["O curso não publica com o certificado ligado", "Falta o responsável, ou não há aula obrigatória publicada com duração. Se o curso usa o modelo global, confira se o modelo está preenchido em **Configurações**, na aba **Certificado**. Se todas as obrigatórias forem aulas de prévia, o certificado também é recusado. Ajuste e salve de novo."],
      ["Mudei o modelo e um certificado antigo continua igual", "É o esperado. Cada certificado guarda o responsável e a assinatura do momento da emissão."],
      ["Os alunos concluíram tudo, mas o certificado não sai", "Uma aula obrigatória pode ter sido arquivada. Ela continua na lista exigida, e a emissão fica travada para todos. Restaure o item. Se a aula não deve mais contar, mude o **Estado** dela para **Rascunho** ou desmarque **Obrigatória para o certificado**. Veja [Arquivar e restaurar conteúdo](/ajuda/arquivar-conteudo)."],
      ["Sou instrutor e não vejo o envio de assinatura", "A assinatura do modelo e a de cada curso são enviadas por um administrador. Peça a alguém com esse papel."],
    ],
    related: ["criar-curso", "marca-da-plataforma"],
  },
  {
    slug: "anuncio-de-lancamento",
    category: "conteudo",
    title: "Anunciar um lançamento",
    summary: "Avise os alunos de que um curso ou módulo está chegando. Quem pedir para ser avisado recebe a notificação no sino quando o conteúdo for publicado.",
    sections: [
      {
        title: "Criar o anúncio",
        steps: [
          "Abra um curso ou um módulo que esteja em **Rascunho**.",
          "Abra a seção **Anúncio de lançamento**. No curso, ela fica na aba **Curso**. No módulo, abaixo do formulário de edição.",
          "Preencha **Título do anúncio** e **Resumo aprovado para os alunos**.",
          "Se quiser, informe a **Previsão de lançamento (opcional)**.",
          "Marque **Exibir anúncio para alunos elegíveis**.",
          "Clique em **Salvar anúncio**.",
        ],
        warn: "Escreva no anúncio apenas o que os alunos já podem saber. Ele fica visível antes da publicação.",
      },
      {
        title: "O que acontece depois",
        list: [
          "O anúncio de curso aparece em **Lançamento em breve**, na página de cursos, para todos os membros.",
          "O anúncio de módulo aparece em **Próximos módulos**, dentro do curso, e só quando o curso já está publicado e o aluno tem acesso a ele.",
          "Nos dois casos, o aluno vê o botão **Quero ser avisado**.",
          "A previsão é só informativa. Ela não publica nada sozinha.",
          "Quando você mudar o **Estado** para **Publicado**, recebe o aviso no sino quem se inscreveu e tem acesso ao conteúdo publicado.",
        ],
      },
    ],
    trouble: [
      ["A seção do anúncio sumiu", "Ela só existe enquanto o conteúdo está em **Rascunho**. Depois de publicado, não há mais anúncio para editar. Cada curso ou módulo tem um único lançamento, e voltar para **Rascunho** não permite anunciar de novo."],
    ],
    related: ["criar-curso"],
  },
  {
    slug: "arquivar-conteudo",
    category: "conteudo",
    title: "Arquivar e restaurar conteúdo",
    summary: "Não existe botão de excluir. Arquivar tira o conteúdo do ar e guarda tudo, para você poder voltar atrás.",
    sections: [
      {
        title: "Antes de arquivar",
        list: [
          "Progresso, histórico e certificados dos alunos são preservados.",
          "Um item arquivado não pode ser editado. Restaure antes de alterar.",
          "Podcasts e encontros ao vivo têm caminho próprio. Veja [Publicar podcasts e masterclasses](/ajuda/administracao-podcasts) e [Agendar encontros ao vivo](/ajuda/administracao-encontros).",
        ],
        warn: "Em curso com certificado, não arquive aula, seção ou módulo que faça parte das aulas obrigatórias. O item continua na lista exigida, e nenhum aluno consegue emitir o certificado enquanto ele estiver arquivado. Para tirar a aula da exigência, mude o **Estado** para **Rascunho** ou desmarque **Obrigatória para o certificado**.",
      },
      {
        title: "Arquivar",
        steps: [
          "Abra o curso, o módulo, a seção, a aula, a pasta ou o material.",
          "Abra a seção **Arquivar registro**.",
          "Clique em **Autorizar alteração crítica**.",
          "Digite a sua **Senha atual** e clique em **Confirmar e executar**.",
          "Confirme a pergunta do navegador.",
        ],
      },
      {
        title: "Restaurar",
        steps: [
          "Abra o item arquivado.",
          "Abra **Restaurar registro** e repita a confirmação com a senha.",
        ],
      },
    ],
    trouble: [
      ["Aparece o aviso para usar arquivar ou restaurar com confirmação", "O item está arquivado, e por isso o salvamento comum é recusado. Restaure primeiro."],
      ["Apareceu um aviso de muitas tentativas", "Há um limite de 5 confirmações de senha por minuto e de 20 por hora. Aguarde um minuto. Se o aviso continuar, espere a hora seguinte."],
    ],
    related: ["criar-curso", "certificado-do-curso", "publicar-materiais"],
  },
  {
    slug: "publicar-materiais",
    category: "conteudo",
    module: "materials",
    title: "Publicar materiais para download",
    summary: "PDFs, planilhas compactadas, áudios e outros arquivos ficam em pastas, com a mesma regra de acesso dos cursos.",
    need: [
      "Uma conta de administrador ou instrutor.",
      "O arquivo em PDF, ZIP, TXT, MP4, MP3, PNG ou JPG.",
    ],
    sections: [
      {
        title: "Criar uma pasta",
        intro: "A pasta é opcional. Sem ela, o material fica na raiz da biblioteca.",
        steps: [
          "No painel, clique em **Materiais**.",
          "Clique em **Nova pasta**.",
          "Preencha o **Nome da pasta**. Se for uma subpasta, escolha a **Pasta superior**.",
          "Mude o **Estado** para **Publicado** e escolha a **Regra de acesso**.",
          "Clique em **Salvar pasta**.",
        ],
      },
      {
        title: "Cadastrar o material e enviar o arquivo",
        steps: [
          "Clique em **Novo material**.",
          "Preencha **Nome** e **Descrição**.",
          "Escolha a **Pasta** e o **Tipo**. Se o arquivo pertence a uma aula específica, escolha a **Aula vinculada**.",
          "Escolha a **Regra de acesso** e deixe o **Estado** em **Rascunho**.",
          "Clique em **Salvar material**.",
          "Em **Enviar arquivo**, clique em **Escolher arquivo**, selecione o arquivo e clique em **Enviar arquivo**.",
          "Espere a mensagem **Arquivo enviado e associado ao registro** e clique em **Fechar editor**.",
        ],
      },
      {
        title: "Publicar",
        steps: [
          "Na lista **Arquivos**, clique em **Editar material**.",
          "Mude o **Estado** para **Publicado** e clique em **Salvar material**.",
        ],
        warn: "Feche o editor antes de publicar, como no passo anterior. Depois do primeiro salvamento, o formulário volta a mostrar os valores padrão. Os dados foram gravados. Não salve de novo sem fechar o editor, porque o segundo salvamento pode trocar a pasta, o tipo e a regra de acesso pelos valores padrão.",
      },
      {
        title: "Limites de arquivo",
        list: [
          "PDF, PNG, JPG e WebP de até 20 MB. O envio otimiza o arquivo e só guarda a versão otimizada, que precisa ficar com até 5 MB (PDF) ou 500 KB (imagem).",
          "ZIP, TXT, MP4 e MP3 de até 500 MB.",
          "A otimização não tem perda visível: a imagem vira WebP e o PDF é comprimido sem perda. A tela mostra quanto o arquivo diminuiu. Um PDF que continue acima de 5 MB depois de otimizado é recusado; nesse caso, exporte de novo com imagens menores.",
          "O envio precisa terminar em até 15 minutos. Em conexão lenta, um arquivo grande não chega a tempo e aparece o aviso de prazo expirado. Nesse caso, reduza o arquivo.",
          "Word, Excel e PowerPoint não são aceitos. Exporte em PDF antes de enviar.",
        ],
      },
      {
        title: "Quando o aluno consegue baixar",
        list: [
          "O material está em **Publicado** e o arquivo foi enviado.",
          "A pasta e as pastas acima dela estão em **Publicado**.",
          "O plano do aluno atende à **Regra de acesso** do material e de cada pasta do caminho.",
          "Se houver **Aula vinculada**, o aluno tem acesso a essa aula.",
        ],
        warn: "Um material publicado aparece na lista mesmo sem arquivo ou sem o plano certo. Nesses casos, o aluno vê o nome, mas não consegue baixar.",
      },
    ],
    trouble: [
      ["A aula vinculada não pode ser trocada", "O vínculo com a aula e a pasta superior são definidos na criação e não mudam depois. Crie um material novo se precisar de outro vínculo."],
      ["Aparece o aviso de prazo do upload expirado", "O envio passou de 15 minutos, e o arquivo não foi associado ao material. Reduza o arquivo e envie de novo."],
    ],
    related: ["criar-curso", "arquivar-conteudo"],
  },
  {
    slug: "administracao-podcasts",
    category: "conteudo",
    module: "podcasts",
    title: "Publicar podcasts e masterclasses",
    summary: "Os episódios usam vídeos do YouTube, divididos em capítulos para o aluno ir direto ao que interessa.",
    need: [
      "Uma conta de administrador.",
      "O vídeo já publicado no YouTube.",
    ],
    sections: [
      {
        title: "Cadastrar um episódio",
        intro: "Todo membro vê os episódios publicados. Podcasts não têm regra de plano.",
        steps: [
          "No painel, clique em **Podcasts**.",
          "Clique em **Novo episódio**.",
          "Cole o link do vídeo em **URL do vídeo no YouTube**.",
          "Escolha o **Tipo**, **Podcast** ou **Masterclass**.",
          "Preencha **Título**, **Descrição** e **Data do episódio**.",
          "Se o episódio também está no Spotify, cole o link em **Link do episódio no Spotify (opcional)**.",
          "Em **Estado**, escolha **Publicado** para exibir no acervo, ou **Rascunho** para guardar.",
          "Clique em **Salvar episódio**.",
        ],
      },
      {
        title: "Dividir em capítulos",
        intro: "No campo **Capítulos**, escreva um capítulo por linha, com o horário seguido do título, em ordem crescente. Os exemplos abaixo mostram o formato.",
        list: [
          "`00:00 Abertura`",
          "`09:00 Como começar`",
          "`27:30 Perguntas do público`",
        ],
        note: "Em episódios com mais de uma hora, use três partes no horário, como em `01:05:00`. Cabem até 40 capítulos.",
      },
      {
        title: "Colocar em destaque",
        steps: [
          "Na lista, clique em **Editar** no episódio.",
          "Com o **Estado** em **Publicado**, marque **Exibir em destaque, substituindo o destaque atual**.",
          "Clique em **Salvar episódio**. Só um episódio fica em destaque por vez.",
        ],
      },
      {
        title: "Tirar um episódio do ar",
        steps: [
          "Abra o episódio e clique em **Arquivar**.",
          "Confirme. Ele sai do acervo, e o histórico é mantido.",
          "Para voltar, clique em **Restaurar**. O episódio retorna como rascunho.",
        ],
      },
    ],
    trouble: [
      ["A URL é recusada", "Use o link comum do vídeo, como os que começam com `https://youtu.be/` ou `https://www.youtube.com/watch`. Links de incorporação, os que têm `/embed/`, não são aceitos."],
      ["Aparece que o vídeo já está cadastrado", "Cada vídeo só entra uma vez. Procure o episódio existente no campo **Buscar…**, no topo da lista, e pressione Enter."],
      ["Um capítulo é recusado", "Confira o formato do horário e se as linhas estão em ordem crescente."],
    ],
    related: ["administracao-encontros", "modulos"],
  },
  {
    slug: "administracao-encontros",
    category: "conteudo",
    module: "live_events",
    title: "Agendar encontros ao vivo",
    summary: "Marque a data, informe o link da sala e escolha quem pode participar. Depois, publique a gravação no mesmo lugar.",
    need: [
      "Uma conta de administrador.",
      "O link da sala no Zoom ou no Google Meet.",
    ],
    sections: [
      {
        title: "Agendar",
        steps: [
          "No painel, clique em **Encontros ao vivo**.",
          "Clique em **Novo encontro**.",
          "Preencha **Título** e **Convidado**.",
          "Informe a **Data e hora (horário de Brasília)** e a **Duração em minutos**.",
          "Cole o **Link da sala**. Ele precisa ser do Zoom ou do Google Meet, porque outros serviços são recusados.",
          "Em **Quem pode acessar**, escolha entre **Planos selecionados**, **Membros com assinatura ativa** e **Todos os membros**. Na primeira opção, marque os planos em **Planos com acesso**.",
          "Em **Situação**, escolha **Publicado**.",
          "Clique em **Salvar encontro**.",
        ],
      },
      {
        title: "Ver quem confirmou",
        steps: [
          "No cartão do encontro, clique em **Ver presenças**. A janela lista quem confirmou e quando.",
        ],
      },
      {
        title: "Publicar a gravação",
        intro: "A gravação aparece para os alunos só depois do horário de término do encontro.",
        steps: [
          "Depois do encontro, clique em **Editar**.",
          "Cole o endereço em **Link da gravação**. Ele precisa começar com `https://`.",
          "Clique em **Salvar encontro**.",
        ],
      },
      {
        title: "Cancelar ou esconder",
        steps: [
          "Clique em **Editar**.",
          "Mude a **Situação** para **Arquivado** ou **Rascunho** e clique em **Salvar encontro**.",
        ],
        warn: "Quem já recebeu o link da sala continua conseguindo abrir pelo Zoom ou pelo Meet. Para encerrar de vez, troque o link na própria sala.",
      },
    ],
    trouble: [
      ["Aparece o aviso para conferir os campos e os links", "Um dos links está fora do padrão. O link da sala precisa começar com `https://` e ser do Zoom ou do Google Meet. No Zoom, use o link de participação, que tem `/j/` ou `/my/`. O link da gravação também precisa começar com `https://`."],
      ["Aparece o aviso para selecionar um plano", "Com **Planos selecionados**, é preciso marcar ao menos um. Se não houver planos, crie um ou escolha outro tipo de acesso."],
    ],
    related: ["administracao-podcasts", "planos"],
  },
  {
    slug: "membros",
    category: "membros-e-vendas",
    title: "Encontrar membros e alterar acessos",
    summary: "A lista mostra quem tem conta, em qual plano e em que situação. Na ficha de cada pessoa você libera, suspende ou muda o papel.",
    sections: [
      {
        title: "Encontrar alguém",
        steps: [
          "No painel, clique em **Membros**.",
          "Digite nome, empresa ou e-mail em **Buscar por nome, empresa ou e-mail** e pressione Enter.",
          "Refine com os filtros **Papel**, **Plano vigente** e **Situação**.",
          "Clique em **Abrir ficha** na linha da pessoa.",
        ],
      },
      {
        title: "O que a ficha mostra",
        list: [
          "**Perfil e acesso**, com e-mail, empresa, papel e situação.",
          "**Plano e vigência**, com o histórico de concessões. Concessão é cada período de acesso dado à pessoa, por compra ou por cortesia.",
          "**Aprendizado**, com o progresso em cada curso.",
          "**Pedidos** e **Chamados** da pessoa.",
        ],
      },
      {
        title: "Dar um plano como cortesia",
        intro: "Cortesia não é pagamento. Ela libera o acesso, fica registrada na auditoria e não entra na receita.",
        steps: [
          "Na ficha, vá até **Alterar acesso**.",
          "Em **Plano a conceder como cortesia**, escolha o plano.",
          "Informe a **Validade da cortesia**, com data e hora no futuro.",
          "Escreva o **Motivo obrigatório**.",
          "Clique em **Revisar alteração** e confira o resumo.",
          "Clique em **Autorizar alteração crítica**, digite a **Senha atual** e clique em **Confirmar e executar**.",
        ],
        warn: "Qualquer alteração feita em **Alterar acesso**, inclusive suspender e revogar, encerra as sessões da pessoa. Ela precisa entrar de novo.",
      },
      {
        title: "Suspender ou reativar",
        steps: [
          "Em **Alterar acesso**, marque **Suspender acesso**. Para reativar, desmarque.",
          "Escreva o motivo e siga a mesma confirmação com a senha.",
        ],
      },
      {
        title: "Retirar um acesso",
        steps: [
          "Marque **Revogar concessões atuais**.",
          "Escreva o motivo e confirme com a senha.",
        ],
        warn: "A revogação atinge todas as concessões da pessoa, inclusive as pagas, e não tem botão de desfazer. Para devolver o acesso, é preciso conceder de novo.",
      },
      {
        title: "Como novos membros chegam",
        intro: "A plataforma não tem cadastro manual de aluno. As contas nascem de dois jeitos.",
        list: [
          "Pelo cadastro na tela de entrada, que fica aberto quando os [documentos legais](/ajuda/documentos-legais) estão publicados.",
          "Pela compra de um plano. Depois que o provedor confirma o pagamento, o acesso é ligado à conta que usa o e-mail do comprador. Se essa conta ainda não existe, a plataforma dispara um convite para esse e-mail. A chegada depende do serviço de e-mail configurado na instalação.",
        ],
      },
    ],
    trouble: [
      ["Aparece Membro sem nome", "A pessoa ainda não completou o perfil. O código ao lado identifica a conta."],
      ["A alteração pede a senha toda vez", "É intencional. Cada autorização vale para uma ação e por poucos minutos."],
      ["Aparece Plano indisponível", "O plano escolhido está inativo. Reative o plano em **Planos** ou escolha outro."],
      ["O aluno esqueceu a senha", "Ele mesmo recupera em **Esqueci minha senha**, na tela de entrada. A equipe não redefine senhas."],
    ],
    related: ["equipe-e-papeis", "planos", "pedidos"],
  },
  {
    slug: "planos",
    category: "membros-e-vendas",
    title: "Criar e ajustar planos de assinatura",
    summary: "O plano define o preço, o tempo de acesso e o que o aluno leva. É ele que libera cursos, materiais e encontros restritos.",
    sections: [
      {
        title: "Criar um plano",
        steps: [
          "No painel, clique em **Planos**.",
          "Clique em **Criar plano**.",
          {
            text: "Preencha o **Nome**, como os alunos vão ver.",
            note: "O **Endereço (slug)**, que é o trecho que identifica o plano no link de venda, é montado sozinho a partir do nome, como em `plano-anual`. Só mexa se quiser outro endereço. O campo aceita letras minúsculas, números e hífens e corrige na hora o que você digitar ou colar. Depois que o plano é salvo, trocar o nome não muda o endereço.",
          },
          "Informe o **Preço em reais** e os **Meses de acesso**.",
          "Escreva os **Benefícios, um por linha**.",
          "Mantenha **Plano ativo** marcado e clique em **Salvar plano**.",
        ],
      },
      {
        title: "Onde o plano aparece",
        list: [
          "Na aba **Assinatura** das configurações do aluno, com o botão **Assinar**.",
          "No checkout, que é a página de pagamento. O link é o endereço da sua plataforma seguido de `/checkout?plano=` e do endereço do plano, como em `https://membros.seudominio.com.br/checkout?plano=plano-anual`. É esse link que você divulga.",
          "Nas regras de acesso de cursos, materiais, espaços da comunidade e encontros.",
        ],
        warn: "Para vender de verdade, a plataforma também precisa da [integração com o Asaas](/ajuda/integracao-asaas) ativa, da [proteção do checkout com o Turnstile](/ajuda/integracao-turnstile) configurada e dos [documentos legais](/ajuda/documentos-legais) publicados. O plano precisa ter preço maior que zero.",
      },
      {
        title: "Pausar um plano",
        intro: "Planos não são excluídos. Um plano inativo deixa de aparecer para assinatura e no checkout. Quem já assinou continua com o acesso até o fim da vigência.",
        steps: [
          "Clique em **Editar plano**.",
          "Desmarque **Plano ativo** e clique em **Salvar plano**.",
        ],
        warn: "O plano inativo também some da lista **Planos permitidos quando restrito**. Se você salvar de novo um curso, módulo, pasta, material ou espaço que dependia dele, o plano sai da regra e os assinantes perdem esse acesso. Reative o plano antes de editar esse conteúdo.",
      },
    ],
    trouble: [
      ["Aparece o aviso de que já existe um registro com esses dados", "O **Endereço (slug)** já está em uso por outro plano. Escreva outro no campo e salve de novo."],
    ],
    related: ["integracao-asaas", "pedidos", "membros"],
  },
  {
    slug: "pedidos",
    category: "membros-e-vendas",
    title: "Consultar pedidos e exportar listas",
    summary: "Cada compra vira um pedido, com a situação confirmada pelo provedor de pagamento. Daqui também saem as planilhas de membros e de vendas.",
    sections: [
      {
        title: "Consultar",
        steps: [
          "No painel, clique em **Pedidos**.",
          "Escolha uma situação, como **Pago** ou **Aguardando pagamento**.",
          "Para achar um pedido específico, digite o código ou o valor em reais, como `49,90`, em **Buscar por ID ou valor em reais** e pressione Enter.",
          "Clique em **Detalhes** para ver o histórico.",
        ],
        note: "A busca procura em todas as situações de uma vez. Ao buscar, o filtro de situação é limpo, e o contrário também vale.",
      },
      {
        title: "Ler as situações",
        list: [
          "**Pago** é o pedido com pagamento confirmado pelo provedor.",
          "**Aguardando pagamento** é o pedido que o comprador ainda não concluiu.",
          "**Estornado** teve o valor devolvido.",
          "**Chargeback** foi contestado no cartão.",
          "**Expirado** e **Cancelado** são compras que não se concluíram.",
        ],
      },
      {
        title: "O que há nos detalhes",
        list: [
          "Valor, método de pagamento e o identificador do pedido.",
          "**Concessão registrada** mostra se o acesso já foi liberado.",
          "**Abrir ficha do membro** leva à conta do comprador.",
        ],
      },
      {
        title: "Estorno e nota fiscal",
        intro: "A tela de pedidos é só de consulta. Ela não faz estorno nem emite nota fiscal. Essas operações ficam com o provedor de pagamento. Quando o provedor avisa a plataforma de um estorno ou de uma contestação, o pedido muda de situação e o acesso daquele pedido é retirado.",
      },
      {
        title: "Exportar para planilha",
        steps: [
          "Em **Membros** ou em **Pedidos**, ajuste a busca e os filtros.",
          "Clique em **Exportar resultado completo em CSV**. CSV é um formato de arquivo que os programas de planilha abrem.",
          "Abra o arquivo no seu programa de planilha.",
        ],
        list: [
          "A exportação leva todas as páginas do resultado, até 5.000 registros.",
          "O arquivo de membros traz nome, papel e situação. Ele não traz e-mail nem plano.",
          "O arquivo de pedidos traz código, valor, método, situação e data.",
        ],
      },
    ],
    trouble: [
      ["O pedido está pago, mas o acesso não foi liberado", "O acesso é ligado à conta que usa o e-mail da compra. Peça ao comprador para entrar ou criar a conta com esse mesmo e-mail e confirmar o endereço."],
      ["O botão de exportar está desativado", "Não há resultado para exportar, ou a lista passa de 5.000 registros. Refine os filtros."],
      ["A exportação falhou no meio", "Nenhum arquivo parcial é gerado. Tente de novo. Se a lista mudou durante a exportação, o sistema pede uma nova tentativa."],
    ],
    related: ["planos", "membros", "dashboard-e-analytics"],
  },
  {
    slug: "moderar-comunidade",
    category: "moderacao-e-atendimento",
    module: "community",
    title: "Moderar publicações, respostas e denúncias",
    summary: "Nada aparece para os membros sem passar pela equipe. A fila mostra o que espera decisão.",
    sections: [
      {
        title: "Aprovar ou recusar publicações",
        steps: [
          "No painel, clique em **Comunidade**. A aba **Publicações** abre com o filtro **Pendentes**.",
          "Leia o conteúdo. Clique no título para ver a publicação inteira.",
          "Clique em **Aprovar** para liberar. A aprovação vale na hora.",
          "Para recusar, clique em **Rejeitar**, escreva o **Motivo da decisão** e clique em **Rejeitar** de novo, na janela.",
        ],
      },
      {
        title: "As quatro decisões",
        intro: "**Rejeitar**, **Ocultar** e **Remover** pedem o motivo. Toda decisão fica na auditoria, e **Aprovar** continua disponível se você mudar de ideia.",
        list: [
          "**Aprovar** publica para todos.",
          "**Rejeitar** devolve ao autor como não aprovado.",
          "**Ocultar** tira do ar um conteúdo já publicado.",
          "**Remover** retira o conteúdo da comunidade.",
        ],
      },
      {
        title: "Moderar respostas",
        steps: [
          "Abra a aba **Respostas**.",
          "Use os mesmos botões em cada resposta. **Abrir publicação** mostra o contexto.",
        ],
      },
      {
        title: "Tratar denúncias",
        steps: [
          "Abra a aba **Denúncias**. As pendentes aparecem primeiro.",
          "Leia o motivo e clique em **Abrir publicação** para ver o conteúdo. O nome de quem denunciou aparece só para administradores.",
          "Se for o caso, modere o conteúdo com **Ocultar** ou **Remover**.",
          "Escolha o **Resultado**, **Tratada** ou **Improcedente**, escreva o **Motivo** e clique em **Concluir análise**.",
        ],
        warn: "Moderar o conteúdo e concluir a denúncia são duas ações separadas. Faça as duas. Depois de concluída, a denúncia não reabre.",
      },
      {
        title: "Organizar os espaços",
        steps: [
          "Abra a aba **Espaços** e clique em **Criar espaço**.",
          "Preencha **Nome** e **Descrição**.",
          "Mude o **Estado** para **Publicado** e escolha a **Regra de acesso**.",
          "Clique em **Salvar espaço**.",
          "Use **Subir** e **Descer** para mudar a ordem em que os espaços aparecem.",
        ],
      },
    ],
    trouble: [
      ["A fila diz que não há registros", "Não há nada pendente. Troque o filtro para **Todas** se quiser rever decisões antigas."],
    ],
    related: ["comentarios-de-aula", "privacidade-e-auditoria"],
  },
  {
    slug: "comentarios-de-aula",
    category: "moderacao-e-atendimento",
    title: "Moderar comentários de aula",
    summary: "Os comentários das aulas também passam por aprovação. A fila reúne os pendentes de todos os cursos.",
    sections: [
      {
        title: "Revisar a fila",
        intro: "A fila **Pendentes** inclui os cursos pagos, mesmo que a sua conta não tenha acesso a eles.",
        steps: [
          "No painel, clique em **Comentários de aula**.",
          "Leia cada comentário em **Pendentes**, com o curso e a aula de origem.",
          "Clique em **Aprovar** para publicar. O aluno recebe um aviso no sino.",
          "Para recusar, clique em **Rejeitar**, escreva o **Motivo** e clique em **Rejeitar comentário**.",
        ],
        warn: "A decisão é definitiva. Um comentário revisado não volta para a fila.",
      },
      {
        title: "Revisar por curso",
        intro: "Neste caminho, o moderador só vê as aulas a que a conta dele tem acesso. Administradores veem todas.",
        steps: [
          "Clique em **Navegar por curso**.",
          "Escolha o curso e depois a aula.",
          "Em **Moderação de comentários**, escolha a **Decisão**, escreva o **Motivo** e clique em **Registrar decisão**.",
        ],
      },
    ],
    related: ["moderar-comunidade"],
  },
  {
    slug: "atender-chamados",
    category: "moderacao-e-atendimento",
    module: "support",
    title: "Atender chamados de suporte",
    summary: "A fila reúne as conversas com os alunos. Você responde, anexa arquivos e define em que pé o chamado fica.",
    sections: [
      {
        title: "Responder",
        steps: [
          "No painel, clique em **Suporte**.",
          "Escolha um chamado na fila. Para achar mais rápido, digite em **Buscar por assunto** e clique em **Buscar**, ou use o filtro **Prioridade** e as abas de situação.",
          "Leia a conversa e os anexos.",
          "Escreva em **Sua resposta**.",
          "Em **Estado após a resposta**, escolha como o chamado deve ficar. O campo já vem com o estado atual. Se você não trocar, o chamado continua como estava.",
          "Clique em **Enviar resposta**.",
        ],
        warn: "Nunca peça senha, número de cartão ou documento pelo chamado.",
      },
      {
        title: "Escolher o estado certo",
        intro: "O estado só muda junto com uma resposta. Quando o aluno responde, o chamado volta para **Aberto** sozinho.",
        list: [
          "**Em andamento** quando você ainda está investigando.",
          "**Aguardando aluno** quando precisa de uma informação da pessoa.",
          "**Resolvido** quando o problema foi encerrado.",
          "**Aberto** quando o chamado deve voltar para a fila.",
        ],
      },
      {
        title: "Enviar um arquivo",
        steps: [
          "Na conversa, vá até **Anexar arquivo à conversa**.",
          "Clique em **Escolher arquivo** e depois em **Enviar arquivo**.",
        ],
        list: [
          "PDF, PNG, JPG ou WebP de até 20 MB, otimizados no envio para até 5 MB (PDF) ou 500 KB (imagem).",
          "ZIP, TXT, MP4 e MP3 de até 20 MB.",
        ],
      },
      {
        title: "Acompanhar a fila",
        list: [
          "**Em aberto** soma tudo o que ainda não foi resolvido.",
          "**Aguardando o membro** mostra o que depende do aluno.",
          "**Média da primeira resposta** conta quanto tempo a equipe leva para responder pela primeira vez.",
          "**Prioridade** é escolhida pelo aluno ao abrir o chamado e serve como filtro.",
        ],
      },
    ],
    related: ["administracao-feedback", "membros"],
  },
  {
    slug: "administracao-feedback",
    category: "moderacao-e-atendimento",
    module: "feedback",
    title: "Fazer a triagem dos feedbacks",
    summary: "Sugestões e relatos de problema chegam em um quadro, e você marca o andamento de cada um.",
    sections: [
      {
        title: "Ler os feedbacks",
        steps: [
          "No painel, clique em **Feedbacks dos alunos**.",
          "Filtre por **Tipo**, como **Sugestão** ou **Bug/Problema**, ou pelas abas de situação.",
          "Clique em um cartão para abrir o relato completo.",
          "Se houver imagem, clique em **Ver print**.",
        ],
      },
      {
        title: "Atualizar a situação",
        steps: [
          "No detalhe, escolha a nova situação.",
          "Clique em **Salvar situação**.",
        ],
      },
      {
        title: "As quatro situações",
        list: [
          "**Novo** acabou de chegar.",
          "**Em análise** está sendo avaliado.",
          "**Planejado** entrou na fila do que será feito.",
          "**Feito** foi resolvido ou entregue.",
        ],
        note: "O detalhe mostra a página de onde o aluno enviou e o navegador usado. Isso ajuda a reproduzir um problema.",
      },
    ],
    trouble: [
      ["Aparece o aviso de que a situação mudou", "Outra pessoa da equipe atualizou o mesmo feedback. Reabra o detalhe e salve de novo."],
    ],
    related: ["atender-chamados"],
  },
  {
    slug: "marca-da-plataforma",
    category: "configuracoes",
    title: "Colocar o seu nome, a sua logo e o seu ícone",
    summary: "A plataforma veste a sua marca no menu, nas telas de entrada, no checkout e nos certificados.",
    need: [
      "Uma conta de administrador.",
      "A logo em SVG, PNG ou WebP, de até 500 KB. Prefira fundo transparente.",
      "Um ícone quadrado em SVG ou PNG.",
    ],
    sections: [
      {
        title: "Trocar o nome",
        steps: [
          "No painel, clique em **Configurações** e abra a aba **Plataforma e marca**.",
          "Em **Identidade da plataforma**, edite o **Nome da instalação**, com até 80 caracteres.",
          "Clique em **Salvar nome**.",
        ],
      },
      {
        title: "Enviar a logo",
        steps: [
          "Em **Logo da plataforma**, no cartão **Logo colorida**, clique em **Escolher logo colorida** e selecione o arquivo.",
          "Confira em **Prévia da identidade** como a logo fica no menu, nas telas públicas, no painel e no certificado, nos dois temas.",
          "Clique em **Salvar logo colorida**.",
          "Repita no cartão **Logo branca**, que aparece no tema escuro.",
        ],
        list: [
          "São aceitos SVG, PNG e WebP de até 500 KB.",
          "PNG e WebP precisam de pelo menos 240 × 60 px e de no máximo 4096 px de cada lado.",
          "Em SVG, converta os textos em curvas no programa de desenho antes de enviar. A plataforma limpa o arquivo e recorta as margens vazias.",
        ],
        note: "Sem a logo branca, a colorida aparece nos dois temas. Em arquivos SVG, a prévia avisa quando a proporção é extrema e, na logo branca e no ícone, quando falta contraste no escuro. Em PNG e WebP não há aviso, então confira a prévia com atenção.",
      },
      {
        title: "Enviar o ícone",
        intro: "O ícone aparece na aba do navegador e no atalho da tela inicial do celular.",
        steps: [
          "Em **Ícone da plataforma**, clique em **Escolher ícone** e selecione um SVG ou um PNG quadrado de pelo menos 180 × 180 px.",
          "Clique em **Salvar ícone**.",
        ],
      },
      {
        title: "Voltar ao padrão",
        intro: "Clique no botão de remover do cartão da imagem, como **Remover logo colorida**. A plataforma volta a mostrar o nome da instalação ou a marca do Icarus.",
      },
    ],
    trouble: [
      ["O arquivo foi recusado", "Confira o formato, o peso de até 500 KB e as dimensões. O ícone em PNG precisa ser quadrado, e WebP não é aceito no ícone. Em SVG, a recusa mais comum é o arquivo sem desenho vetorial, só com texto ou com uma imagem embutida. Converta os textos em curvas e exporte a arte como vetor."],
      ["Aparece o aviso de que o nome mudou em outra sessão", "Outra pessoa alterou o nome enquanto você editava. Revise o texto e salve de novo."],
    ],
    related: ["certificado-do-curso", "modulos"],
  },
  {
    slug: "modulos",
    category: "configuracoes",
    title: "Ligar e desligar recursos da plataforma",
    summary: "Nem toda operação precisa de tudo. Você escolhe quais áreas os alunos enxergam, sem perder nenhum dado.",
    sections: [
      {
        title: "Ligar ou desligar",
        steps: [
          "No painel, clique em **Configurações** e abra a aba **Módulos**.",
          "Clique no interruptor do recurso. A mudança vale na hora.",
        ],
      },
      {
        title: "O que pode ser desligado",
        list: [
          "**Comunidade** tira o fórum do ar. Os comentários de aula continuam, porque fazem parte de Cursos.",
          "**Materiais** esconde a biblioteca. Os anexos de cada aula continuam.",
          "**Podcasts e masterclasses** esconde o acervo de episódios.",
          "**Ranking** esconde a classificação. Os pontos seguem sendo contados.",
          "**Encontros ao vivo** esconde a agenda e as gravações.",
          "**Suporte** fecha a abertura e o acompanhamento de chamados pelos alunos. Eles deixam de ver também os chamados em andamento, então resolva os abertos antes de desligar.",
          "**Central de ajuda** esconde esta central dos alunos. A equipe continua vendo.",
          "**Feedback dos alunos** tira o botão de feedback do topo.",
        ],
      },
      {
        title: "O que nunca desliga",
        intro: "**Cursos** e **Certificados** são o centro da plataforma e ficam sempre ativos. As exportações de dados também não dependem de nenhum módulo.",
      },
      {
        title: "O que acontece ao desligar",
        list: [
          "O recurso some do menu do aluno, e o endereço mostra **Recurso indisponível**.",
          "Nenhum dado é apagado. Ao religar, tudo volta como estava.",
          "A equipe continua acessando o painel daquele módulo, com o selo **Desativado**, e pode preparar conteúdo.",
        ],
        warn: "Em encontros ao vivo, quem já recebeu o link da sala continua conseguindo abrir pelo Zoom ou pelo Meet. Para encerrar de vez, troque o link na própria sala.",
      },
    ],
    related: ["administracao", "marca-da-plataforma"],
  },
  {
    slug: "perguntas-do-primeiro-acesso",
    category: "configuracoes",
    title: "Configurar as perguntas do primeiro acesso",
    summary: "No primeiro acesso, cada membro informa o nome completo e o nome da empresa, que são sempre obrigatórios. Você escolhe as demais perguntas, a ordem e quais são obrigatórias.",
    sections: [
      {
        title: "Criar uma pergunta",
        steps: [
          "No painel, clique em **Configurações**. A aba **Onboarding** abre primeiro.",
          "Clique em **Adicionar pergunta**.",
          "Em **Campo do perfil**, escolha a que informação a pergunta se refere, como **Segmento** ou **Tamanho da equipe**. Cada campo aceita uma única pergunta.",
          "Escreva a **Pergunta** como o membro vai ler.",
          "Escolha o **Tipo de resposta**, entre **Texto curto**, **Texto longo** e **Lista de opções**.",
          "Se for lista, escreva as alternativas em **Opções, uma por linha**.",
          "Marque **Obrigatória** se a resposta não puder ficar em branco, e mantenha **Ativa** marcada.",
          "Clique em **Salvar pergunta**.",
        ],
      },
      {
        title: "Mudar a ordem",
        steps: ["Use **Subir** e **Descer** em cada linha."],
      },
      {
        title: "Tirar uma pergunta",
        intro: "Perguntas não são excluídas, só desativadas.",
        steps: [
          "Clique em **Editar pergunta**.",
          "Desmarque **Ativa** e clique em **Salvar pergunta**.",
        ],
      },
      {
        title: "Como as perguntas aparecem para o membro",
        list: [
          "Listas com até 8 opções aparecem como cartões de escolha, mais fáceis de responder no celular.",
          "O membro pode rever as respostas depois em **Configurações**, aba **Sua empresa**.",
        ],
      },
    ],
    trouble: [
      ["Aparece o aviso de que já existe um registro com esses dados", "Já há uma pergunta para aquele campo do perfil. Edite a existente."],
      ["Aparece o aviso para configurar as opções", "Uma lista ativa precisa de pelo menos uma opção."],
    ],
    related: ["documentos-legais", "membros"],
  },
  {
    slug: "documentos-legais",
    category: "configuracoes",
    title: "Publicar os termos de uso e a política de privacidade",
    summary: "Os dois documentos precisam estar publicados para a plataforma aceitar cadastros e vendas.",
    sections: [
      {
        title: "Publicar um documento",
        steps: [
          "No painel, clique em **Configurações** e abra a aba **Documentos legais**.",
          "Clique em **Nova versão**.",
          "Em **Tipo**, escolha **Termos de uso** ou **Privacidade**.",
          "Preencha a **Versão**, como `1.0`, e o **Título**.",
          "Cole o texto completo em **Texto integral**.",
          "Desmarque **Demonstração, sem validade jurídica**.",
          "Marque **Publicado** e clique em **Salvar documento**.",
          "Repita para o outro tipo.",
        ],
        warn: "A caixa de demonstração já vem marcada em documentos novos. Enquanto ela estiver marcada, o cadastro e o pagamento ficam bloqueados.",
      },
      {
        title: "Atualizar um texto",
        intro: "Depois que alguém aceita uma versão, o texto dela fica travado. Para mudar, publique uma versão nova. Assim fica preservado o que cada pessoa aceitou.",
        steps: [
          "Clique em **Nova versão** e escolha o **Tipo**.",
          "Em **Versão**, use um número novo, como `1.1`. Repetir um número já usado é recusado.",
          "Preencha o **Título**, cole o texto novo em **Texto integral** e desmarque **Demonstração, sem validade jurídica**.",
          "Marque **Publicado** e clique em **Salvar documento**. A versão anterior do mesmo tipo sai do ar sozinha.",
        ],
      },
      {
        title: "Sobre o conteúdo",
        intro: "A plataforma não fornece textos jurídicos. Publique documentos revisados por quem responde legalmente pela sua operação.",
      },
    ],
    trouble: [
      ["O cadastro continua fechado", "Confira se os dois tipos estão publicados e sem a marca de demonstração."],
      ["Aparece o aviso de que já existe um registro com esses dados", "Já existe um documento desse tipo com o mesmo número de versão. Use um número novo, como `1.1`."],
    ],
    related: ["planos", "privacidade-e-auditoria"],
  },
  {
    slug: "privacidade-e-auditoria",
    category: "configuracoes",
    title: "Atender pedidos de privacidade e consultar a auditoria",
    summary: "Duas abas guardam a memória da operação. Uma registra os pedidos de privacidade dos membros, a outra mostra quem fez o quê no painel.",
    sections: [
      {
        title: "Atender um pedido de privacidade",
        steps: [
          "No painel, clique em **Configurações** e abra a aba **Privacidade**.",
          "Veja o tipo do pedido e o nome do membro, que a tela chama de titular. Os abertos aparecem primeiro.",
          "Cumpra o pedido fora desta tela. O painel não tem botão para excluir uma conta, e esse trabalho fica com quem cuida do servidor da instalação.",
          "Escolha a **Nova situação**, escreva o **Motivo do registro** e clique em **Registrar atendimento**.",
        ],
        list: [
          "Enquanto a exclusão não é feita, você pode usar **Suspender acesso** na [ficha do membro](/ajuda/membros).",
          "A exportação é feita pelo próprio aluno, em **Configurações**, aba **Privacidade**, botão **Exportar meus dados**.",
          "Depois de **Concluído** ou **Recusado**, o pedido não muda mais.",
        ],
        warn: "Registrar o atendimento não exporta nem apaga dados. A tela guarda o histórico da decisão. A execução do pedido é sua, respeitando o que a lei manda manter.",
      },
      {
        title: "Consultar a auditoria",
        intro: "A auditoria é só de leitura. Ninguém edita nem apaga um registro.",
        steps: [
          "Em **Configurações**, abra a aba **Auditoria**.",
          "Digite a ação, a pessoa ou o alvo em **Buscar por ação, ator ou alvo** e pressione Enter.",
          "Leia cada linha. Ela mostra data e hora, quem fez, o que fez, sobre o quê e o motivo informado.",
        ],
      },
      {
        title: "O que fica registrado",
        list: [
          "Mudanças de papel, cortesias, suspensões e revogações.",
          "Decisões de moderação.",
          "Exportações de listas em arquivo CSV.",
          "Alterações nas integrações, sem os valores das chaves.",
          "Módulos ligados e desligados.",
        ],
      },
    ],
    related: ["equipe-e-papeis", "documentos-legais"],
  },
];
