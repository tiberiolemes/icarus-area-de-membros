import type { HelpArticle } from "./help-content";

/** Artigos do aluno. Rótulos em negrito são os da tela: ao mudar uma tela, ajuste aqui. */
export const memberArticles: HelpArticle[] = [
  {
    slug: "acesso",
    category: "primeiros-passos",
    title: "Entrar na plataforma e recuperar a senha",
    summary: "Do primeiro acesso à troca de senha quando ela escapa da memória, este é o caminho até as suas aulas.",
    sections: [
      {
        title: "Entrar com e-mail e senha",
        steps: [
          "Abra o endereço da plataforma. Se você ainda não estiver conectado, a tela **Entre na sua área de membros** aparece sozinha.",
          "Digite o **Email** e a **Senha** da sua conta.",
          "Se aparecer uma verificação de segurança abaixo dos campos, espere ela terminar. Ela só confirma que há uma pessoa do outro lado.",
          "Clique em **Entrar**. Você chega em **Cursos**, ou na aula do link que tentou abrir antes de entrar.",
        ],
        note: "O ícone de olho dentro do campo mostra a senha digitada. Ajuda a achar um erro antes de tentar de novo.",
      },
      {
        title: "Criar a sua conta",
        intro: "Este caminho vale quando a plataforma aceita cadastro aberto. Se você comprou um plano ou recebeu um convite, vá para a parte do primeiro acesso por convite.",
        steps: [
          "Na tela de entrada, clique em **Criar conta**.",
          "Preencha **Nome completo** e **Email**. O **Telefone** é opcional.",
          "Crie uma **Senha** com pelo menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.",
          "Marque **Li e aceito os Termos de uso e a Política de privacidade**. A caixa de comunicações de marketing é opcional.",
          "Clique em **Criar conta**.",
          {
            text: "Abra a mensagem de confirmação no seu e-mail e clique no link. Ele confirma o cadastro e abre a plataforma na tela **Complete seu perfil**.",
            note: "Se o link abrir a tela de entrada, entre com o e-mail e a senha que você criou.",
          },
        ],
        note: "Se aparecer o aviso **O cadastro está indisponível nesta instalação**, a entrada acontece só por convite ou pela compra de um plano.",
      },
      {
        title: "Recuperar a senha",
        steps: [
          "Na tela de entrada, clique em **Esqueci minha senha**.",
          "Digite o **Email** da conta e clique em **Solicitar recuperação**.",
          "Abra a mensagem mais recente que chegar e clique no link.",
          "Na tela **Defina uma nova senha**, preencha **Senha** e **Confirme a nova senha**. Use pelo menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.",
          "Clique em **Salvar nova senha**. Você já entra na plataforma com a senha nova.",
        ],
        note: "Por segurança, a tela mostra o mesmo aviso exista ou não uma conta com aquele e-mail. Se nada chegar, confira se o endereço foi digitado certo.",
      },
      {
        title: "Primeiro acesso por convite ou compra",
        intro: "Quem recebeu um convite ou comprou sem ter conta escolhe a própria senha no primeiro acesso.",
        steps: [
          "Abra o e-mail de convite e clique no link.",
          "Na tela **Defina sua primeira senha**, preencha **Nova senha** e **Confirme sua nova senha**. Use pelo menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.",
          "Clique em **Definir senha e continuar**.",
        ],
      },
      {
        title: "Completar o perfil",
        intro: "No primeiro acesso, a plataforma pede alguns dados antes de liberar as aulas.",
        steps: [
          "Na tela **Complete seu perfil**, confira o **Nome completo**. É ele que sai no seu certificado.",
          "Responda às perguntas sobre a sua empresa. As marcadas com **Resposta obrigatória** não podem ficar em branco.",
          "Clique em **Concluir e continuar**.",
        ],
        note: "As respostas podem ser ajustadas depois em **Configurações**, na aba **Sua empresa**.",
      },
      {
        title: "Quando a sessão termina sozinha",
        intro: "Por segurança, a plataforma encerra a sessão de alunos depois de 2 horas sem uso. Para contas da equipe, o limite é de 30 minutos.",
        list: [
          "Um minuto antes, aparece um aviso com o botão **Continuar conectado**. Clique nele para seguir.",
          "Conta como uso clicar, tocar ou digitar na página. Um vídeo tocando sozinho não conta.",
          "Se a sessão já terminou, entre de novo com o seu e-mail e a sua senha.",
          "Quem usa a [verificação em duas etapas](/ajuda/verificacao-em-duas-etapas) e marca **Lembrar por 15 dias** fica conectado por esse prazo, sem o limite de 2 horas.",
        ],
      },
    ],
    trouble: [
      ["A tela diz que o e-mail ou a senha são inválidos", "Confira se o e-mail é o mesmo do cadastro ou da compra e se a tecla de maiúsculas não ficou ligada. Se a dúvida for a senha, use **Esqueci minha senha**."],
      ["Aparece um aviso pedindo para confirmar o e-mail", "Clique em **Reenviar confirmação de email**, logo abaixo do formulário. Na tela **Confirme seu email**, digite o **Email** e clique em **Reenviar confirmação**. Depois abra o link da mensagem mais recente, porque o anterior deixa de valer."],
      ["O link do e-mail abriu uma tela dizendo que expirou", "Os links valem por tempo limitado e funcionam uma única vez. Na própria tela, clique em **Reenviar confirmação** ou em **Solicitar recuperação** e informe o seu e-mail para receber um link novo."],
      ["A mensagem não chegou", "Espere alguns minutos e olhe a caixa de spam e a de promoções. Para a confirmação do cadastro, tente entrar e use o link **Reenviar confirmação de email**. Para a recuperação, repita **Esqueci minha senha**. O convite e o acesso de uma compra não têm reenvio na tela de entrada. Nesse caso, fale com a equipe e informe o e-mail usado."],
      ["Apareceu um aviso de muitas tentativas", "A plataforma pausa novas tentativas por alguns minutos para proteger a conta. Aguarde e tente de novo com calma."],
      ["A verificação de segurança não aparece ou não termina", "Recarregue a página. Se você usa bloqueador de anúncios, libere este site e tente outra vez."],
      ["Apareceu a tela Acesso indisponível", "A conta está suspensa ou sem acesso à área de membros. Fale com a equipe responsável pela plataforma para entender o motivo. O botão **Sair e usar outra conta** leva de volta à tela de entrada."],
    ],
    related: ["verificacao-em-duas-etapas", "conhecer-a-plataforma", "assinatura"],
  },
  {
    slug: "conhecer-a-plataforma",
    category: "primeiros-passos",
    title: "Conhecer o menu e encontrar cada área",
    summary: "Um passeio rápido pela tela, para você saber onde fica cada coisa no computador e no celular.",
    sections: [
      {
        title: "O menu principal",
        intro: "Em telas largas, o menu fica à esquerda. No celular, no tablet e em janelas estreitas, toque no botão de menu no topo para abrir.",
        list: [
          "**Cursos** lista os cursos publicados, mostra de onde você parou e marca com cadeado o que o seu plano não inclui.",
          "**Comunidade** é o espaço de conversa entre os membros.",
          "**Materiais** guarda os arquivos para baixar.",
          "**Podcasts** traz episódios e masterclasses em vídeo.",
          "**Certificados** mostra os documentos que você já conquistou.",
          "**Ranking** exibe a sua pontuação no período.",
          "**Encontros ao vivo** tem a agenda e as gravações.",
          "**Suporte** é onde você fala com a equipe.",
          "**Central de ajuda** é esta página.",
        ],
        note: "O seu menu pode ser mais curto. A equipe escolhe quais recursos ficam ativos em cada plataforma.",
      },
      {
        title: "O que fica no topo da tela",
        list: [
          "O campo **Busca rápida em aulas e módulos** encontra cursos, módulos e aulas pelo título. Digite pelo menos duas letras.",
          "O ícone de interrogação abre o **Guia desta tela**, que ilumina cada parte da página e explica para que ela serve.",
          "O ícone de balão com um sinal de mais, **Enviar feedback**, leva uma sugestão ou um problema até a equipe.",
          "O sino guarda os seus avisos.",
          "O cartão com o seu nome abre as **Configurações** da conta.",
        ],
        note: "No computador, **Ctrl+K** leva o cursor direto para a busca. No Mac, o atalho é **⌘K**. As setas percorrem os resultados e **Enter** abre o escolhido.",
      },
      {
        title: "No celular",
        list: [
          "O botão de menu no topo abre a lista completa de áreas.",
          "A busca fica atrás do ícone de lupa, também no topo.",
          "A barra de baixo traz os atalhos mais usados, como **Cursos**, **Comunidade**, **Ranking** e **Materiais**.",
          "**Perfil**, na mesma barra, abre as suas configurações.",
        ],
      },
      {
        title: "Trocar entre tema claro e escuro",
        steps: [
          "Abra o menu e vá até o fim da lista.",
          "Clique no botão do tema, que mostra **Tema claro** ou **Tema escuro**.",
        ],
        note: "A troca vale na hora e fica salva na sua conta, em qualquer aparelho.",
      },
      {
        title: "Sair da conta",
        steps: ["Abra o menu e clique em **Sair**, no fim da lista."],
        note: "Sair encerra a sua sessão em todos os aparelhos. Em computador compartilhado, saia sempre que terminar.",
      },
    ],
    trouble: [
      ["Abri um link e apareceu Recurso indisponível", "Aquela área está desligada nesta plataforma. Os seus dados continuam guardados. Use **Voltar aos cursos** para seguir estudando."],
      ["Apareceu Página não encontrada", "O endereço mudou ou o conteúdo saiu do ar. Volte aos cursos e procure pelo título na busca do topo."],
    ],
    related: ["acesso", "cursos", "conta"],
  },
  {
    slug: "verificacao-em-duas-etapas",
    category: "primeiros-passos",
    title: "Proteger a conta com a verificação em duas etapas",
    summary: "Além da senha, a plataforma passa a pedir um código de seis dígitos gerado no seu celular. Quem descobrir a sua senha continua do lado de fora.",
    need: ["Um celular com um aplicativo autenticador instalado, como Google Authenticator, Microsoft Authenticator ou Authy."],
    sections: [
      {
        title: "Ativar",
        steps: [
          "Abra **Configurações**, no fim do menu. No celular, toque em **Perfil** na barra de baixo.",
          "Entre na aba **Segurança** e desça até **Verificação em duas etapas**.",
          "Clique em **Consultar autenticadores**. É esse clique que libera o restante da configuração.",
          "Clique em **Configurar aplicativo autenticador**.",
          "No celular, abra o aplicativo autenticador e escolha a opção de adicionar uma conta.",
          "Aponte a câmera do celular para o QR Code que aparece na tela.",
          "Digite em **Código de seis dígitos** o número que o aplicativo mostrar.",
          "Clique em **Ativar verificação**.",
        ],
        note: "Se a câmera não ler o QR Code, digite no aplicativo a **Chave de configuração** que aparece logo abaixo dele. Ela só é exibida durante a configuração.",
      },
      {
        title: "Entrar com o código",
        steps: [
          "Na tela de entrada, informe e-mail e senha e clique em **Entrar**.",
          "Abra o aplicativo autenticador e digite o **Código de seis dígitos** do momento.",
          "Clique em **Verificar e entrar**.",
        ],
      },
      {
        title: "Ficar conectado por 15 dias",
        intro: "Na tela do código existe a caixa **Lembrar por 15 dias**. Marcada, ela mantém você conectado naquele navegador sem pedir senha nem código de novo.",
        list: [
          "Use só em aparelho pessoal.",
          "Os 15 dias contam a partir do momento em que você entra e não se renovam.",
          "Clicar em **Sair** encerra a sessão em todos os aparelhos, inclusive nos lembrados.",
        ],
      },
      {
        title: "Quando a sessão termina sozinha",
        intro: "Sem a caixa de lembrar, a plataforma encerra a sessão depois de um tempo sem uso. São 2 horas para alunos e 30 minutos para contas da equipe. Um minuto antes aparece o botão **Continuar conectado**. Os detalhes estão em [Entrar na plataforma e recuperar a senha](/ajuda/acesso).",
      },
      {
        title: "Remover o autenticador",
        steps: [
          "Em **Configurações**, aba **Segurança**, clique em **Consultar autenticadores**.",
          "Clique em **Remover autenticador** e confirme.",
        ],
      },
      {
        title: "Trocar de celular",
        intro: "Faça a troca enquanto o aparelho antigo ainda funciona, porque é ele que gera o código de entrada.",
        steps: [
          "Entre na plataforma com o código do celular antigo.",
          "Em **Configurações**, aba **Segurança**, clique em **Consultar autenticadores**.",
          "Clique em **Remover autenticador** e confirme.",
          "Clique em **Configurar aplicativo autenticador** e repita a ativação com o celular novo.",
        ],
        warn: "Sem o código do aparelho antigo não é possível entrar na plataforma. Se isso acontecer, fale com a equipe responsável pela plataforma.",
      },
    ],
    trouble: [
      ["O código é recusado", "Os códigos mudam a cada 30 segundos. Espere o próximo e digite sem espaços. Se continuar, confira se a hora do celular está no ajuste automático."],
      ["Marquei para lembrar, mas o código foi pedido de novo", "O navegador pode não ter guardado o lembrete, como acontece em janela anônima. Entre normalmente e marque a caixa outra vez."],
    ],
    related: ["acesso", "conta"],
  },
  {
    slug: "cursos",
    category: "cursos-e-aulas",
    title: "Encontrar um curso e assistir às aulas",
    summary: "Do catálogo até a última aula, com a plataforma lembrando onde você parou.",
    sections: [
      {
        title: "Escolher o que assistir",
        steps: [
          "Clique em **Cursos** no menu. A tela **Seus cursos e trilhas** lista os cursos publicados.",
          "Encontre o curso pelos filtros **Todos os cursos**, **Em andamento**, **Concluídos** e **Restritos**, ou digite parte do nome em **Buscar no catálogo**.",
          "No cartão do curso, clique em **Começar curso** ou **Continuar curso** para abrir a aula. Em curso já concluído, o botão vira **Rever aulas**.",
        ],
        list: [
          "**Retomar aula**, no bloco do topo, volta direto à aula em que você parou. O bloco só aparece para quem já começou algum curso.",
          "**Ver ementa** abre a página do curso, com a lista de módulos e aulas.",
          "Os cursos que o seu plano não inclui aparecem com cadeado e o selo **Acesso restrito**.",
          "A caixa de seleção ao lado da busca muda a ordem dos cartões. As opções são **Mais recentes**, **Maior progresso**, **Ordem alfabética** e **Carga horária**.",
        ],
      },
      {
        title: "Assistir a uma aula",
        intro: "**Começar curso** e **Continuar curso** já abrem a aula. Se você entrou por **Ver ementa**, clique em **Começar** ou **Continuar** na página do curso, ou abra um módulo em **Conteúdo do curso** e escolha a aula pelo nome.",
        steps: [
          "Dê play no vídeo ou no áudio. A aula de leitura não tem vídeo. Ela traz o selo **Leitura**, e o texto fica na aba **Descrição**.",
          "Ao terminar, clique em **Marcar como concluída**. É isso que faz o seu progresso andar.",
          "Use **Próxima aula** para seguir em frente ou **Aula anterior** para rever. No celular, o botão de voltar aparece como **Anterior**.",
        ],
        warn: "A conclusão de uma aula não pode ser desfeita. Marque só quando terminar de verdade, porque ela conta para o certificado.",
      },
      {
        title: "Navegar pela lista de aulas",
        list: [
          "No computador, a lista fica ao lado do vídeo. O botão **Ocultar conteúdos** esconde a lista e **Mostrar conteúdos** traz de volta.",
          "No celular, a lista aparece abaixo da descrição da aula.",
          "O campo **Filtrar tópicos e aulas** encontra uma aula pelo nome dentro do curso.",
          "A seta no topo, **Voltar ao módulo**, leva para a lista de aulas daquele módulo.",
        ],
      },
      {
        title: "Continuar de onde parou",
        intro: "A plataforma salva sozinha o ponto do vídeo enquanto ele toca, quando você pausa e quando sai da página.",
        list: [
          "Para garantir, clique no ícone de relógio, **Salvar ponto de retomada**, antes de fechar.",
          "O ponto salvo é sempre o mais avançado que você alcançou. Voltar o vídeo para rever um trecho não apaga o seu avanço.",
        ],
      },
      {
        title: "Quando aparece um cadeado",
        intro: "O cadeado e o selo **Acesso restrito** aparecem quando o seu plano não inclui aquele conteúdo ou quando a validade do plano terminou.",
        steps: [
          "Clique em **Consultar acesso** no cartão, ou abra o conteúdo bloqueado.",
          "Clique em **Ver planos disponíveis** para conhecer as opções de assinatura.",
        ],
      },
      {
        title: "Ser avisado de um lançamento",
        intro: "Cursos que ainda vão sair aparecem na seção **Lançamento em breve**, no fim da tela **Cursos**. Módulos novos de um curso que você já acessa aparecem em **Próximos módulos**, na página desse curso.",
        steps: [
          "Clique em **Quero ser avisado** no conteúdo que interessa.",
        ],
        note: "O botão muda para **Aviso ativado**. Quando o conteúdo for publicado, o aviso chega no sino de quem tem acesso a ele.",
      },
    ],
    trouble: [
      ["O vídeo não carrega", "Clique em **Tentar carregar vídeo**. Se a mensagem continuar, teste outra rede ou outro navegador e avise a equipe. Se **Suporte** aparece no seu menu, abra um chamado por lá."],
      ["Não acho uma aula que já vi", "Use a busca do topo e digite parte do título. Ela procura em cursos, módulos e aulas liberados para você."],
      ["O curso sumiu da minha lista", "Clique em **Todos os cursos** e apague a busca, porque um filtro ativo esconde cartões. Se o curso aparecer com cadeado, o seu plano venceu ou não inclui mais esse curso. Confira a validade em **Configurações**, aba **Assinatura**. Se ele não aparecer em nenhum filtro, a equipe tirou o curso do ar."],
    ],
    related: ["recursos-da-aula", "certificados", "assinatura"],
  },
  {
    slug: "recursos-da-aula",
    category: "cursos-e-aulas",
    title: "Aproveitar comentários, anotações e materiais da aula",
    summary: "Abaixo do vídeo ficam as ferramentas que transformam assistir em aprender.",
    sections: [
      {
        title: "As abas abaixo do vídeo",
        list: [
          "**Descrição** traz o texto ou o resumo da aula e, quando o instrutor preparou, capítulos, destaques e uma lista de tarefas.",
          "**Materiais** reúne os arquivos daquela aula.",
          "**Comentários** é o espaço de dúvidas e reflexões.",
          "**Anotações pessoais** guarda o que você escrever, só para você.",
        ],
      },
      {
        title: "Avançar para a próxima aula automaticamente",
        intro: "Abaixo de **Marcar como concluída** fica o interruptor **Avançar para a próxima aula automaticamente**. Ele começa desligado e vale para todas as aulas da sua conta.",
        list: [
          "Com ele ligado, **Marcar como concluída** leva direto para a próxima aula assim que a plataforma confirma a conclusão.",
          "Com ele ligado, quando o vídeo ou o áudio chega ao fim, a aula é marcada como concluída e aparece **Próxima aula em 5 segundos**. Clique em **Ir agora** para seguir na hora ou em **Cancelar** para ficar na aula.",
          "Ele não avança na última aula, quando a próxima aula não está liberada para o seu plano ou quando a conclusão emite o seu certificado, para você ver o aviso. Com o certificado já emitido, as aulas seguintes, como as de bônus, voltam a avançar.",
          "Com ele desligado, o fim do vídeo não marca nada. A conclusão continua sendo pelo botão.",
        ],
        warn: "Com o interruptor ligado, chegar ao fim do vídeo conta como conclusão, e a conclusão não pode ser desfeita.",
      },
      {
        title: "Pular para um capítulo",
        steps: [
          "Abra a aba **Descrição**.",
          "Clique no capítulo desejado. O vídeo vai direto para aquele ponto.",
        ],
      },
      {
        title: "Marcar a lista de tarefas",
        intro: "Algumas aulas trazem uma lista de tarefas para pôr o conteúdo em prática. Ela fica na aba **Descrição**, com o título **Checklist de Aplicação Prática**.",
        steps: ["Marque cada item conforme for cumprindo. A marcação é salva na hora."],
      },
      {
        title: "Baixar um material da aula",
        steps: [
          "Abra a aba **Materiais**.",
          "Clique em **Baixar** ao lado do arquivo. O download abre em uma nova aba.",
        ],
      },
      {
        title: "Comentar ou tirar uma dúvida",
        steps: [
          "Abra a aba **Comentários**.",
          "Escreva a sua mensagem e clique em **Publicar comentário**.",
          "Aguarde a revisão da equipe. Enquanto isso, só você e a equipe veem o comentário, com o selo **Em moderação**.",
        ],
        note: "Quando o seu comentário é aprovado, um aviso chega no sino.",
      },
      {
        title: "Responder a um comentário",
        steps: [
          "Na aba **Comentários**, clique em **Responder** no comentário escolhido.",
          "Escreva a resposta e clique em **Enviar resposta**.",
        ],
        note: "A resposta também passa pela revisão da equipe antes de aparecer para os outros.",
      },
      {
        title: "Fazer anotações com o minuto do vídeo",
        steps: [
          "Pause no trecho que quer lembrar e abra a aba **Anotações pessoais**.",
          "Escreva e clique em **Salvar anotação**. O minuto do vídeo fica guardado junto.",
          "Mais tarde, clique no horário da anotação para o vídeo voltar àquele ponto.",
          "Use **Editar** ou **Excluir** para ajustar o que escreveu.",
        ],
      },
      {
        title: "Marcar uma aula como favorita",
        steps: ["Clique no ícone de marcador ao lado do título, **Favoritar aula**. Para desfazer, clique de novo."],
        note: "O marcador fica preenchido só naquela aula. A plataforma não tem uma lista que reúna as aulas favoritas.",
      },
      {
        title: "Controles do vídeo",
        list: [
          "A velocidade vai de 0,5x a 2x.",
          "**Avançar 10 segundos** pula um trecho curto.",
          "O ícone de legendas aparece quando a aula tem legenda.",
          "**Tela cheia** faz o vídeo ocupar a tela inteira.",
          "**Picture-in-Picture** solta o vídeo em uma janela pequena, que fica por cima das outras.",
        ],
        note: "Os controles mudam conforme o serviço em que o vídeo está guardado. Em algumas aulas, o vídeo traz os próprios botões.",
      },
    ],
    trouble: [
      ["Meu comentário aparece como Rejeitado", "A equipe não aprovou o comentário, e ele não aparece para os outros alunos. Reescreva com outro enfoque. Para entender o motivo, fale com a equipe. Quando **Suporte** aparece no menu, o chamado é o caminho."],
      ["O botão Baixar virou Consultar acesso", "Aquele material não está no seu plano. O link leva às opções de assinatura."],
    ],
    related: ["cursos", "materiais", "notificacoes"],
  },
  {
    slug: "materiais",
    category: "cursos-e-aulas",
    module: "materials",
    title: "Encontrar e baixar materiais",
    summary: "A biblioteca reúne em pastas os arquivos que acompanham os cursos.",
    sections: [
      {
        title: "Baixar um arquivo",
        steps: [
          "Clique em **Materiais** no menu.",
          "Clique em **Abrir pasta** na pasta desejada. O nome dela passa a ser o título da página.",
          "Confira o nome, o tipo e o tamanho do arquivo.",
          "Clique em **Baixar**. O arquivo abre em uma nova aba.",
          "Para subir um nível, clique em **Voltar aos materiais**.",
        ],
        note: "O link de download é temporário e expira em cerca de dois minutos. Se ele expirar, clique em **Baixar** de novo.",
      },
      {
        title: "Achar um arquivo mais rápido",
        list: [
          "O campo **Buscar arquivos** procura pelo nome dentro da pasta aberta.",
          "Na primeira tela, **Só arquivos** esconde as pastas e **Pastas e arquivos** mostra tudo.",
        ],
      },
    ],
    trouble: [
      ["Aparece Consultar acesso no lugar de Baixar", "O arquivo pertence a um plano diferente do seu. Clique em **Ver planos disponíveis** para conhecer as opções."],
      ["A pasta está vazia", "Os arquivos podem estar em uma pasta interna ou ainda não foram publicados. Abra as pastas internas uma a uma, porque a busca só procura na pasta aberta."],
    ],
    related: ["recursos-da-aula", "assinatura"],
  },
  {
    slug: "certificados",
    category: "cursos-e-aulas",
    title: "Emitir, baixar e validar um certificado",
    summary: "O certificado sai sozinho quando você conclui todas as aulas obrigatórias de um curso que oferece o documento.",
    sections: [
      {
        title: "Conquistar o certificado",
        intro: "Quando você conclui a última aula obrigatória, a plataforma emite o certificado e um aviso chega no sino. Para isso, o curso precisa oferecer o documento e o seu perfil precisa ter o nome completo.",
        steps: [
          "Assista às aulas do curso e clique em **Marcar como concluída** em cada uma.",
          "Clique em **Certificados** no menu para ver o documento.",
        ],
        note: "Aulas de seções bônus não entram na conta. O nome impresso é o **Nome completo** do seu perfil no momento da emissão, então confira antes de terminar o curso.",
      },
      {
        title: "Acompanhar o que falta",
        steps: [
          "Em **Certificados**, desça até **Trilha de habilitação**.",
          "Confira, em cada curso, o seu progresso e o motivo quando falta algo.",
          "Clique em **Abrir curso** para voltar às aulas.",
          "Se o botão **Emitir certificado** aparecer, clique nele. Isso acontece quando a equipe terminou de configurar o documento depois que você concluiu o curso.",
        ],
      },
      {
        title: "Baixar e compartilhar",
        steps: [
          "Em **Certificados emitidos**, escolha **Baixar PDF** ou **Baixar PNG**.",
          "Para mostrar a alguém, clique em **Copiar link de verificação** e envie o link.",
        ],
      },
      {
        title: "Validar um certificado",
        intro: "Qualquer pessoa confere se um certificado é verdadeiro, sem precisar de conta.",
        steps: [
          "No fim da tela **Certificados**, em **Verificação pública**, clique em **Verificar certificado**. Quem recebeu o link de verificação só precisa abri-lo.",
          "Digite o **Código de verificação** impresso no documento e clique em **Verificar certificado**.",
        ],
        note: "A página informa se o documento é válido, de quem é e de qual curso.",
      },
    ],
    trouble: [
      ["Concluí o curso e o certificado não apareceu", "Abra **Trilha de habilitação** e leia o motivo ao lado do curso. Os mais comuns são alguma aula obrigatória sem conclusão, nome completo em branco no perfil ou curso que não emite certificado."],
      ["O nome saiu errado", "O documento guarda os dados do dia da emissão e não muda com edições posteriores. Fale com a equipe sobre o que pode ser feito. Se **Suporte** aparece no seu menu, abra um chamado e informe o nome certo."],
      ["O certificado aparece como revogado", "A equipe invalidou o documento. O download fica bloqueado e a verificação pública mostra essa situação. Procure a equipe para entender o motivo."],
    ],
    related: ["cursos", "conta", "suporte"],
  },
  {
    slug: "comunidade",
    category: "comunidade-e-eventos",
    module: "community",
    title: "Publicar e participar da comunidade",
    summary: "Um espaço para trocar experiências com outros membros. Tudo passa por uma revisão humana antes de aparecer para os demais.",
    sections: [
      {
        title: "Escrever uma publicação",
        steps: [
          "Clique em **Comunidade** no menu.",
          "Clique em **Escrever publicação**.",
          "Preencha o **Título**.",
          "Escolha o **Espaço** em que a conversa se encaixa.",
          "Escreva o texto em **Sua publicação**.",
          "Clique em **Enviar para revisão**.",
        ],
      },
      {
        title: "Incluir uma imagem",
        intro: "A imagem entra depois do texto. Assim que você envia a publicação, o campo **Enviar arquivo** aparece logo abaixo do formulário.",
        steps: [
          "Arraste a imagem até a área de envio ou clique em **Selecionar arquivo**. Vale PNG, JPG ou WebP de até 20 MB. A imagem é otimizada no envio e precisa ficar com até 500 KB.",
          "O envio começa assim que você escolhe a imagem. Espere a mensagem de arquivo enviado.",
        ],
        note: "Tenha a imagem à mão antes de enviar o texto, porque o campo só aparece nesse momento.",
      },
      {
        title: "O que acontece depois do envio",
        list: [
          "A publicação fica com o selo **Enviado para revisão**, e só você e a equipe conseguem ver.",
          "Quando a equipe aprova, ela aparece para os membros com acesso àquele espaço.",
        ],
      },
      {
        title: "Editar uma publicação sua",
        steps: [
          "Abra a publicação e clique em **Editar publicação**.",
          "Ajuste o texto e clique em **Enviar para revisão**.",
        ],
        note: "O texto editado volta para a revisão da equipe antes de aparecer de novo para os outros membros.",
      },
      {
        title: "Responder e apoiar",
        steps: [
          "Abra a publicação clicando no título.",
          "Use **Votar** para apoiar o conteúdo. Clique de novo para retirar o voto.",
          "Em **Sua contribuição**, escreva a resposta e clique em **Enviar resposta para revisão**.",
        ],
      },
      {
        title: "Encontrar conversas",
        list: [
          "Os espaços no topo filtram as publicações por assunto.",
          "O campo **Buscar discussões** procura no título e no texto.",
          "**Carregar mais discussões**, no fim da lista, traz as publicações anteriores.",
        ],
      },
      {
        title: "Arquivar uma publicação sua",
        steps: [
          "Abra a publicação e clique em **Arquivar publicação**.",
          "Confirme em **Confirmar arquivamento**. Ela deixa de aparecer para os outros, e nada é apagado.",
        ],
        note: "Para voltar atrás, abra a publicação, clique em **Restaurar publicação** e confirme em **Confirmar restauração**.",
      },
      {
        title: "Denunciar um conteúdo",
        steps: [
          "Na publicação ou na resposta, clique em **Denunciar**.",
          "Explique o **Motivo** com pelo menos 10 caracteres e clique em **Enviar denúncia**.",
        ],
        note: "A denúncia vai para a análise da equipe. Ela não remove o conteúdo automaticamente.",
      },
      {
        title: "Selos ao lado do nome",
        list: [
          "O selo dourado com coroa, **Admin**, identifica quem administra a plataforma.",
          "**Instrutor**, **Moderação** e **Suporte** identificam as outras pessoas da equipe.",
          "Os demais participantes aparecem com o nome do plano ou com o selo **Membro**.",
        ],
      },
    ],
    trouble: [
      ["Minha publicação aparece como Não aprovado", "A equipe não liberou o conteúdo. Abra a publicação, clique em **Editar publicação**, ajuste o texto e envie de novo. Para saber o motivo, fale com a equipe. Se **Suporte** aparece no seu menu, pergunte por um chamado."],
      ["Não consigo responder", "Só publicações aprovadas recebem respostas. As arquivadas ficam apenas para leitura."],
      ["Não vejo o botão Escrever publicação", "O botão só aparece quando existe pelo menos um espaço liberado para a sua conta. Se nenhum espaço aparece no topo da tela, não há espaço aberto para o seu plano."],
    ],
    related: ["ranking", "suporte"],
  },
  {
    slug: "ranking",
    category: "comunidade-e-eventos",
    module: "ranking",
    title: "Entender o ranking e a pontuação",
    summary: "O ranking transforma o seu estudo e a sua participação em pontos e mostra a sua colocação no período.",
    sections: [
      {
        title: "Ver a sua colocação",
        steps: [
          "Clique em **Ranking** no menu ou na barra de baixo do celular.",
          "Em **Sua colocação**, veja a sua posição e os seus pontos, mesmo que você não esteja entre os primeiros.",
        ],
        list: [
          "O **Pódio** mostra os três primeiros lugares do período.",
          "Quem está empatado fica fora do pódio e aparece na **Lista de classificação**, com a marca **Empate**.",
        ],
      },
      {
        title: "Como os pontos são somados",
        intro: "Clique em **Como pontuar** para ver quanto vale cada ação nesta plataforma. As ações que contam são estas.",
        list: [
          "Concluir uma aula.",
          "Ter um certificado emitido.",
          "Ter uma publicação aprovada na comunidade.",
          "Ter uma resposta aprovada.",
          "Receber um voto em uma publicação sua. O voto vem do botão **Votar** da comunidade e aparece nas regras como **Curtida recebida em post**.",
        ],
        note: "Os pontos de comunidade só existem quando a Comunidade está ativa na plataforma.",
      },
      {
        title: "Mudar o período",
        steps: [
          "Clique no botão de período. Ele começa em **Mês atual**.",
          "Escolha um atalho, como **Últimos 30 dias** ou **Este ano**. O ranking muda na hora.",
        ],
      },
      {
        title: "Escolher um intervalo próprio",
        steps: [
          "Clique no botão de período e escolha **Personalizado**.",
          "Informe a **Data inicial** e a **Data final**.",
          "Clique em **Aplicar**.",
        ],
      },
      {
        title: "Privacidade no ranking",
        list: [
          "Nenhum nome aparece. A sua linha vem como **Você** e as demais como **Membro**.",
          "Contas da equipe ficam fora da classificação.",
          "Empates dividem a mesma posição.",
        ],
      },
    ],
    trouble: [
      ["Estou sem colocação", "Você ainda não pontuou no período escolhido. Conclua uma aula ou troque para um intervalo maior."],
      ["A premiação aparece como não configurada", "Esse aviso indica que não há prêmio cadastrado para o mês. O ranking funciona normalmente."],
    ],
    related: ["comunidade", "cursos"],
  },
  {
    slug: "encontros",
    category: "comunidade-e-eventos",
    module: "live_events",
    title: "Participar dos encontros ao vivo",
    summary: "Sessões com convidados, em data marcada. Você confirma presença, entra na sala pelo link e revê depois pela gravação.",
    sections: [
      {
        title: "Confirmar presença",
        steps: [
          "Clique em **Encontros ao vivo** no menu.",
          "Escolha o encontro. O primeiro da agenda já aparece aberto, em destaque. Nos demais, clique em **Participar** para abrir as opções.",
          "Clique em **Confirmar presença**. Se os planos mudarem, **Cancelar presença** desfaz.",
        ],
        note: "As datas e os horários aparecem no horário de Brasília.",
      },
      {
        title: "Colocar na agenda",
        steps: [
          "No encontro, abra **Adicionar à agenda**.",
          "Escolha **Google Agenda** para abrir o evento pronto, ou **Baixar evento (.ics)** para usar em outra agenda.",
        ],
        note: "O arquivo baixado é um convite que os aplicativos de agenda do celular e do computador abrem. Toque ou clique nele para adicionar o encontro.",
      },
      {
        title: "Entrar na sala",
        steps: ["No horário, abra **Encontros ao vivo** e clique em **Entrar na sala**."],
        note: "O link da sala fica disponível até o fim previsto do encontro. Depois disso, o caminho é a gravação.",
      },
      {
        title: "Assistir à gravação",
        steps: [
          "Clique em **Gravações anteriores**.",
          "Escolha o encontro e clique em **Assistir gravação**.",
        ],
      },
    ],
    trouble: [
      ["Aparece um aviso de que o encontro é de outro plano", "Aquele encontro não está incluído na sua assinatura. Clique em **Ver planos disponíveis** para conhecer as opções."],
      ["Não vejo o botão para confirmar presença", "Nos encontros fora do destaque, clique antes em **Participar** para abrir as opções. Se a tela mostrar **Inscrições encerradas**, a confirmação já fechou, o que acontece quando o encontro começa."],
      ["A gravação não apareceu", "Ela entra no acervo depois que o encontro termina e a equipe cadastra o link. Volte mais tarde."],
    ],
    related: ["assinatura", "podcasts"],
  },
  {
    slug: "podcasts",
    category: "comunidade-e-eventos",
    module: "podcasts",
    title: "Assistir a podcasts e masterclasses",
    summary: "Episódios em vídeo, divididos em capítulos, para ver no seu ritmo.",
    sections: [
      {
        title: "Assistir a um episódio",
        steps: [
          "Clique em **Podcasts** no menu.",
          "Clique em **Assistir episódio** no destaque, ou escolha um cartão em **Todos os episódios**. O vídeo abre em uma janela.",
          "Clique em um trecho de **Capítulos** para ir direto a ele.",
          "Ao terminar, clique em **Marcar como assistido**. O cartão ganha o selo **Assistido**.",
        ],
      },
      {
        title: "Outras formas de acompanhar",
        list: [
          "**Buscar por título** encontra um episódio pelo nome.",
          "**Ouvir no Spotify** aparece quando o episódio também está lá.",
          "**Abrir no YouTube** leva ao vídeo original.",
        ],
      },
    ],
    trouble: [
      ["Aparece Vídeo indisponível", "O vídeo pode ter sido removido da origem. Avise a equipe e informe o nome do episódio. Se **Suporte** aparece no seu menu, abra um chamado por lá."],
    ],
    related: ["encontros", "cursos"],
  },
  {
    slug: "conta",
    category: "conta-e-assinatura",
    title: "Atualizar perfil, foto e tema",
    summary: "Seu nome, sua foto e a aparência da plataforma ficam em Configurações.",
    sections: [
      {
        title: "Abrir as configurações",
        list: [
          "No computador, clique em **Configurações**, no fim do menu, ou no cartão com o seu nome no topo.",
          "No celular, toque em **Perfil** na barra de baixo.",
        ],
      },
      {
        title: "Atualizar os seus dados",
        steps: [
          "Na aba **Meu perfil**, edite **Nome completo**, **Telefone** e **Bio**. A bio é uma frase curta sobre você, com até 80 caracteres.",
          "Clique em **Salvar perfil**. O botão só acende depois que você muda algum campo.",
        ],
        note: "O **Nome completo** é o que sai nos certificados. O e-mail não muda por aqui, e sim na aba **Segurança**.",
      },
      {
        title: "Trocar a foto",
        steps: [
          "Na aba **Meu perfil**, clique em **Alterar foto**.",
          "Clique em **Selecionar arquivo** e escolha uma imagem JPG ou PNG de até 20 MB. No computador, você também pode arrastar a foto até a área de envio.",
          "Arraste o controle **Posição do recorte** até o enquadramento ficar bom.",
          "Clique em **Salvar foto**.",
        ],
        note: "A foto enviada por você sempre vale mais que qualquer outra e troca a do Gravatar, se houver.",
      },
      {
        title: "De onde vem a imagem do seu perfil",
        intro: "A imagem aparece no topo, no seu perfil e nas suas publicações da comunidade.",
        list: [
          "Se você enviou uma foto, é ela que aparece.",
          "Sem foto enviada, na primeira entrada a plataforma procura uma foto ligada ao seu e-mail no Gravatar. Se encontrar, guarda uma cópia e passa a mostrar essa foto.",
          "Sem foto nenhuma, aparece uma imagem gerada em preto, cinza e branco. Ela é sempre a mesma para a sua conta.",
        ],
      },
      {
        title: "Escolher tema claro ou escuro",
        steps: [
          "Na aba **Meu perfil**, desça até **Aparência**.",
          "No campo **Tema**, escolha **Claro** ou **Escuro**.",
          "Clique em **Salvar aparência**.",
        ],
      },
      {
        title: "Rever as respostas sobre a sua empresa",
        steps: [
          "Abra a aba **Sua empresa**.",
          "Ajuste as respostas e clique em **Salvar dados da empresa**.",
        ],
      },
      {
        title: "Trocar o e-mail",
        steps: [
          "Abra a aba **Segurança**.",
          "Preencha **Novo email** e clique em **Solicitar alteração de email**.",
        ],
        note: "A troca só vale depois que você confirmar pelos links enviados aos endereços envolvidos.",
      },
      {
        title: "Trocar a senha",
        steps: [
          "Na aba **Segurança**, preencha **Nova senha** e **Confirme a nova senha**. Use pelo menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.",
          "Clique em **Atualizar senha**.",
        ],
      },
      {
        title: "Encerrar sessões em outros aparelhos",
        steps: [
          "Na aba **Segurança**, desça até **Sessões**.",
          "Clique em **Encerrar outras sessões**. Só o aparelho em uso continua conectado.",
        ],
      },
    ],
    trouble: [
      ["A foto foi recusada", "A imagem passa de 20 MB ou não é JPG nem PNG. Escolha outra foto, ou salve esta em JPG, e envie de novo."],
      ["Mudei o e-mail e continua o antigo", "A troca só acontece depois que você abre os links de confirmação enviados aos endereços envolvidos."],
    ],
    related: ["verificacao-em-duas-etapas", "notificacoes", "privacidade"],
  },
  {
    slug: "notificacoes",
    category: "conta-e-assinatura",
    title: "Ler avisos e escolher notificações",
    summary: "O sino reúne o que aconteceu enquanto você estava fora, e você decide quais avisos quer receber.",
    sections: [
      {
        title: "Ler os avisos",
        steps: [
          "Clique no sino, no topo da tela. O número sobre ele mostra quantos avisos você ainda não leu.",
          "No aviso, clique no link que aparece dentro dele, como **Ver certificados** ou **Ver curso**. Ele abre o conteúdo e o aviso passa a contar como lido.",
        ],
        list: [
          "Para limpar tudo de uma vez, clique em **Marcar todas como lidas**.",
          "Para rever avisos antigos, clique em **Ver todas as notificações**.",
        ],
      },
      {
        title: "O que gera aviso",
        list: [
          "Um certificado seu foi emitido.",
          "Um comentário seu em uma aula foi aprovado.",
          "Um conteúdo em que você clicou em **Quero ser avisado** foi publicado.",
        ],
      },
      {
        title: "Escolher o que receber",
        steps: [
          "Abra **Configurações** e entre na aba **Notificações**.",
          "Na coluna **Na plataforma**, ligue ou desligue cada tipo de aviso. A escolha é salva na hora, sem botão de confirmar.",
        ],
      },
    ],
    trouble: [
      ["Não recebi o aviso de um lançamento", "Confira se **Lançamentos inscritos** está ligado nas preferências e se o seu plano inclui aquele conteúdo."],
    ],
    related: ["conta", "cursos"],
  },
  {
    slug: "assinatura",
    category: "conta-e-assinatura",
    title: "Assinar um plano e acompanhar o pedido",
    summary: "Veja o seu plano atual, contrate outro e acompanhe a liberação do acesso depois do pagamento.",
    sections: [
      {
        title: "Consultar o seu plano",
        steps: [
          "Abra **Configurações** e entre na aba **Assinatura**.",
          "Em **Plano atual**, confira o nome do plano e a validade.",
        ],
        note: "A compra vale pelo período do plano, indicado em meses logo abaixo do nome. Quando ele termina, o acesso só continua com uma nova compra.",
      },
      {
        title: "Entender o preço de cada plano",
        intro: "Em **Planos disponíveis**, cada plano aparece em um cartão com o nome, o tempo de acesso, a parcela em destaque e os benefícios.",
        list: [
          "A parcela em destaque é o preço dividido em 12 vezes no cartão, arredondado para cima no centavo. Logo abaixo vem o valor à vista.",
          "Quando o cartão diz **sem juros**, o parcelamento no cartão não tem acréscimo.",
          "Quando o cartão diz **em até 12x no cartão**, o parcelamento pode ter juros. O valor final da parcela aparece na hora do pagamento.",
          "Plano gratuito aparece como **Gratuito**, sem parcela.",
          "O plano que você já tem mostra **Seu plano atual** no lugar do botão **Assinar**.",
        ],
      },
      {
        title: "Assinar",
        steps: [
          "Na aba **Assinatura**, escolha um plano em **Planos disponíveis** e clique em **Assinar**.",
          "Em **Dados do assinante**, preencha **Nome completo** e **CPF ou CNPJ**. O **Email** já vem com o da sua conta e não pode ser trocado ali. O celular é opcional.",
          "Escolha a **Forma de pagamento**. **Pix** é à vista. Em **Cartão de crédito**, o campo **Parcelas** permite dividir em até 12 vezes.",
          "Marque **Aceito os Termos de uso e a Política de privacidade**.",
          "Clique em **Continuar com Pix**, que vem seguido do valor, ou em **Continuar para pagamento seguro**, conforme a forma escolhida. Você segue para o ambiente seguro do provedor de pagamento, onde paga o Pix ou digita os dados do cartão.",
        ],
        note: "Os dados do cartão são digitados só no ambiente do provedor de pagamento. A plataforma não vê nem guarda esse número.",
      },
      {
        title: "Acompanhar o pedido",
        intro: "Depois de pagar, você volta para a tela **Acompanhe seu pedido**.",
        steps: [
          "Clique em **Consultar novamente** para atualizar a situação. Enquanto a confirmação não chega, ela fica em **Aguardando pagamento**.",
          "Quando aparecer **Pago** e o aviso de acesso confirmado, clique em **Abrir meus cursos**.",
        ],
      },
      {
        title: "Comprou sem ter conta",
        list: [
          "As instruções de acesso são enviadas para o e-mail informado na compra, depois da confirmação do pagamento.",
          "O acompanhamento do pedido funciona por 2 horas no mesmo navegador usado na compra.",
          "Depois desse tempo, ou em outro aparelho, clique em **Entrar** na página do pedido e use a conta ligada à compra.",
        ],
      },
    ],
    trouble: [
      ["O pagamento aparece como indisponível", "A plataforma ainda não ativou as cobranças, e nenhum valor é cobrado. Fale com a equipe para saber quando abre."],
      ["Paguei e o acesso não liberou", "A confirmação vem do provedor de pagamento e pode levar alguns minutos. Clique em **Consultar novamente**. Se continuar pendente, fale com a equipe e informe o e-mail usado na compra. Quem já tem conta e vê **Suporte** no menu pode abrir um chamado. Quem ainda não tem conta precisa falar com a equipe por outro canal."],
      ["O pedido aparece como Expirado ou Cancelado", "O link de pagamento do provedor vale por 60 minutos. Se o pagamento não for concluído nesse tempo, o pedido expira. **Cancelado** aparece quando o pagamento é cancelado no ambiente do provedor. Para tentar de novo, volte a **Configurações**, aba **Assinatura**, e clique em **Assinar**."],
      ["Apareceu um aviso de muitas tentativas", "Há um limite de tentativas por minuto para proteger a página de pagamento. Aguarde um minuto e tente de novo."],
      ["A verificação de segurança não carrega", "Recarregue a página. Sem ela, o pagamento não avança."],
    ],
    related: ["acesso", "suporte", "privacidade"],
  },
  {
    slug: "privacidade",
    category: "conta-e-assinatura",
    title: "Exportar os seus dados ou pedir a exclusão da conta",
    summary: "Os dados são seus. Você baixa uma cópia quando quiser e pode pedir que a conta seja excluída.",
    sections: [
      {
        title: "Baixar uma cópia dos seus dados",
        steps: [
          "Abra **Configurações** e entre na aba **Privacidade**.",
          "Clique em **Exportar meus dados**. O arquivo é baixado na hora para o seu aparelho.",
        ],
        note: "O arquivo vem em formato JSON, que abre em qualquer editor de texto. Ele reúne os dados ligados à sua conta, inclusive os feedbacks que você enviou.",
      },
      {
        title: "Pedir a exclusão da conta",
        steps: [
          "Na aba **Privacidade**, clique em **Solicitar exclusão**.",
          "Digite `EXCLUIR`, em maiúsculas, no campo **Digite EXCLUIR para confirmar**.",
          "Clique em **Enviar solicitação**.",
        ],
        warn: "O pedido não apaga a conta na hora. A equipe analisa antes, porque alguns registros precisam ser mantidos por obrigação legal.",
      },
      {
        title: "Foto do Gravatar",
        intro: "Quem ainda não tem foto recebe uma busca no Gravatar, o serviço de fotos de perfil da Automattic, na primeira entrada.",
        list: [
          "A plataforma envia ao Gravatar só um código calculado a partir do seu e-mail, e não o e-mail em si.",
          "A consulta é feita pelo servidor da plataforma. Quem vê a sua foto não acessa o Gravatar.",
          "Se houver foto, uma cópia fica guardada na plataforma, como uma foto que você enviasse. Para trocar, envie outra em **Configurações**, aba **Meu perfil**.",
        ],
      },
      {
        title: "Ler a política de privacidade",
        steps: ["Na mesma aba, clique em **Consultar a política de privacidade**."],
      },
    ],
    related: ["conta", "suporte"],
  },
  {
    slug: "suporte",
    category: "ajuda-e-suporte",
    module: "support",
    title: "Abrir um chamado e falar com a equipe",
    summary: "Quando a dúvida não se resolve por aqui, o chamado abre uma conversa com a equipe e guarda todo o histórico.",
    sections: [
      {
        title: "Abrir um chamado",
        steps: [
          "Clique em **Suporte** no menu.",
          "Clique em **Abrir chamado**.",
          "Escreva um **Assunto** curto, que resuma o problema.",
          "Escolha a **Prioridade**. Na dúvida, deixe **Normal**.",
          "Explique em **Mensagem** o que aconteceu, em que tela e o que você esperava ver.",
          "Clique em **Enviar chamado**.",
        ],
        warn: "Nunca escreva senhas, número de cartão ou documentos na mensagem.",
      },
      {
        title: "Anexar um print ou arquivo",
        steps: [
          "Abra o chamado enviado.",
          "Em **Anexar arquivo à conversa**, arraste o arquivo até a área de envio ou clique em **Selecionar arquivo**.",
          "O envio começa assim que você escolhe o arquivo.",
        ],
        note: "São aceitos PDF, ZIP, TXT, PNG, JPG, WebP e MP3. Vídeo não é aceito; para mostrar o que aparece na tela, envie um print. Imagens e PDFs de até 20 MB são otimizados no envio e precisam ficar com até 500 KB (imagem) ou 5 MB (PDF). Os demais arquivos vão até 20 MB.",
      },
      {
        title: "Acompanhar e responder",
        steps: [
          "Em **Suporte**, abra o chamado em **Meus chamados recentes**.",
          "Leia as mensagens. As da equipe trazem o selo **Equipe**.",
          "Escreva em **Sua resposta** e clique em **Enviar resposta**.",
        ],
        note: "A resposta da equipe não gera aviso no sino. Volte a **Suporte** para conferir se o chamado mudou de situação.",
      },
      {
        title: "Reabrir um chamado resolvido",
        steps: [
          "Abra o chamado e escreva o que ainda falta.",
          "Clique em **Reabrir e responder**.",
        ],
      },
      {
        title: "O que significa cada situação",
        list: [
          "**Aberto** quer dizer que o chamado espera a equipe.",
          "**Em andamento** aparece quando alguém já está cuidando.",
          "**Aguardando aluno** pede uma resposta sua.",
          "**Resolvido** marca o atendimento como concluído. Se ainda faltar algo, dá para reabrir.",
        ],
      },
    ],
    trouble: [
      ["O arquivo foi recusado", "O tipo ou o tamanho passa do permitido. Converta para PDF ou reduza a imagem e envie de novo."],
    ],
    related: ["feedback", "acesso"],
  },
  {
    slug: "feedback",
    category: "ajuda-e-suporte",
    module: "feedback",
    title: "Enviar uma sugestão ou relatar um problema",
    summary: "O botão de feedback leva a sua ideia ou o seu relato direto para quem cuida da plataforma.",
    sections: [
      {
        title: "Enviar",
        steps: [
          "Clique em **Enviar feedback**, o ícone de balão com um sinal de mais no topo da tela.",
          "Em **Tipo**, escolha **Sugestão**, **Bug/Problema** ou **Outro**.",
          "Conte em **Descrição** o que você pensou ou o que aconteceu.",
          "Se ajudar, anexe uma imagem em **Print (opcional)**. Arraste o arquivo até a área de envio ou clique em **Selecionar arquivo**. Vale PNG, JPG ou WebP de até 20 MB. A imagem é otimizada no envio e precisa ficar com até 5 MB.",
          "Clique em **Enviar feedback**.",
        ],
        warn: "Antes de anexar um print, confira se ele não mostra senha, dado pessoal ou informação de pagamento.",
      },
      {
        title: "Feedback ou chamado",
        intro: "O feedback serve para melhorar a plataforma e não abre uma conversa. Quem precisa de uma resposta deve falar com a equipe. Quando **Suporte** aparece no menu, o caminho é [abrir um chamado](/ajuda/suporte).",
      },
    ],
    related: ["suporte"],
  },
];
