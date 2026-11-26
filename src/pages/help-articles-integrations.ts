import type { HelpArticle, HelpImage } from "./help-content";
import asaasMenu from "./help-images/asaas-1-menu.webp";
import asaasKeys from "./help-images/asaas-2-chaves.webp";
import asaasNewKey from "./help-images/asaas-3-gerar.webp";
import asaasWebhooks from "./help-images/asaas-4-webhooks.webp";
import asaasWebhookForm from "./help-images/asaas-5-formulario.webp";
import asaasCheckoutEvents from "./help-images/asaas-6-checkouts.webp";
import asaasPaymentEvents from "./help-images/asaas-7-cobrancas.webp";
import bunnyMenu from "./help-images/bunny-1-menu.webp";
import bunnyName from "./help-images/bunny-2-nome.webp";
import bunnyRegions from "./help-images/bunny-3-regioes.webp";
import bunnyApi from "./help-images/bunny-4-api.webp";
import bunnyApiKey from "./help-images/bunny-5-chave.webp";
import bunnyDomains from "./help-images/bunny-6-dominios.webp";
import bunnyToken from "./help-images/bunny-7-token.webp";
import bunnyUpload from "./help-images/bunny-8-video.webp";
import turnstileMenu from "./help-images/turnstile-1-menu.webp";
import turnstileForm from "./help-images/turnstile-2-formulario.webp";
import turnstileCreate from "./help-images/turnstile-3-criar.webp";
import turnstileKeys from "./help-images/turnstile-4-chaves.webp";

/** Telas reais das plataformas, com dados de exemplo. Os números em rosa são citados entre parênteses nos passos. */
const shot = (src: string, width: number, height: number, alt: string, caption: string): HelpImage => ({ src, width, height, alt, caption });

export const integrationArticles: HelpArticle[] = [
  {
    slug: "integracoes",
    category: "integracoes",
    title: "Entender as integrações e o que preparar",
    summary: "As integrações ligam a plataforma a serviços de fora. O Asaas recebe os pagamentos, o Bunny Stream hospeda os vídeos e o Turnstile barra robôs.",
    sections: [
      {
        title: "O que cada uma faz",
        list: [
          "**Gateway Asaas** processa as vendas por Pix e cartão e avisa a plataforma quando o pagamento cai. Sem ele, o checkout, que é a página de pagamento, fica indisponível.",
          "**Bunny Stream** guarda e transmite os vídeos das aulas, e a plataforma assina cada reprodução. É opcional, porque as aulas também aceitam arquivo MP4 enviado direto.",
          "**Cloudflare Turnstile** é a verificação que aparece no login e no checkout para confirmar que há uma pessoa do outro lado.",
        ],
      },
      {
        title: "Em que ordem configurar",
        steps: [
          "Comece pelo [Cloudflare Turnstile](/ajuda/integracao-turnstile). Em uma instalação de produção, o checkout só abre depois que o segredo dele está no servidor.",
          "Configure o [Asaas](/ajuda/integracao-asaas) para receber os pagamentos.",
          "Deixe o [Bunny Stream](/ajuda/integracao-bunny) para quando quiser hospedar os vídeos fora da plataforma.",
        ],
        note: "Para saber se a sua instalação é de produção, veja o item **Aplicação** em **Outros serviços da plataforma**, no fim da página de integrações.",
      },
      {
        title: "Antes de mexer",
        intro: "As credenciais ficam protegidas por duas travas. A verificação em duas etapas libera os campos, e a senha da sua conta confirma cada alteração.",
        steps: [
          "Ative a [verificação em duas etapas](/ajuda/verificacao-em-duas-etapas) na sua conta de administrador. Sem ela, os campos aparecem desabilitados.",
          "Tenha a senha da sua conta à mão. Ela é pedida quando você salva uma credencial, gera o token do webhook ou liga as cobranças.",
        ],
        note: "Se os campos continuarem desabilitados depois de ativar a verificação, saia e entre de novo informando o código do autenticador.",
      },
      {
        title: "Abrir a tela",
        steps: [
          "No painel, clique em **Configurações**.",
          "Abra a aba **Integrações**.",
          "Escolha **Gateway Asaas** ou **Bunny Stream**.",
        ],
        note: "O Turnstile não tem aba própria. As chaves dele entram na configuração do servidor, e o painel só mostra se o segredo do checkout já está lá, no cartão **Turnstile do checkout** da aba **Gateway Asaas**.",
      },
      {
        title: "Ler o estado de cada provedor",
        list: [
          "**Não configurado** indica que ainda falta algum dado.",
          "**Configurado** indica que todos os dados foram salvos. Esse estado não depende do teste de conexão.",
          "**Com erro** indica um dado inválido, um teste que falhou ou uma consulta que não respondeu. A mensagem logo abaixo diz qual foi.",
          "**Testar conexão** faz uma consulta de verdade ao provedor com a chave salva. O teste não cobre o webhook do Asaas nem a chave do player do Bunny.",
          "**Atualizar estado** recarrega a situação e limpa o resultado do último teste.",
        ],
      },
      {
        title: "Como as chaves ficam guardadas",
        list: [
          "Embaixo de cada campo, a tela mostra de onde vem o valor. **Cofre do Supabase** indica que ele foi salvo por esta tela e fica no cofre de segredos do banco de dados da plataforma.",
          "**Variável de ambiente** indica que o valor foi definido direto no servidor por quem instalou a plataforma. Esse campo não muda pela tela.",
          "Depois de salva, a chave não aparece mais. A tela mostra só os quatro últimos caracteres, para você conferir qual está em uso.",
          "Para trocar, digite a nova. Para manter, deixe o campo em branco.",
        ],
      },
      {
        title: "Outros serviços da plataforma",
        intro: "No fim da página, **Outros serviços da plataforma** mostra a situação da aplicação, do armazenamento e do e-mail. É só para consulta, porque esses itens são configurados na instalação. O item **Aplicação** mostra **Produção** em uma plataforma no ar e **Local** em um ambiente de testes de quem instalou.",
      },
    ],
    trouble: [
      ["Os campos estão desabilitados", "Falta a verificação em duas etapas, ou a sessão atual entrou sem o código. Ative a verificação, saia e entre de novo com o código do autenticador."],
      ["Apareceu um aviso de muitas tentativas", "Há um limite de alterações e de testes por minuto. Aguarde um minuto e continue. A confirmação de senha também tem um teto de 20 por hora, e a tela fala em um minuto nos dois casos. Se o aviso continuar, espere a hora seguinte."],
      ["A senha não é aceita", "Confira se é a senha da sua conta na plataforma, e não a do Asaas ou a do Bunny."],
    ],
    related: ["integracao-asaas", "integracao-bunny", "integracao-turnstile"],
  },
  {
    slug: "integracao-asaas",
    category: "integracoes",
    title: "Receber pagamentos com o Asaas",
    summary: "A configuração tem duas metades. Uma chave para a plataforma falar com o Asaas, e um webhook para o Asaas avisar a plataforma quando o pagamento é confirmado.",
    need: [
      "Uma conta no Asaas. Para testar sem dinheiro de verdade, crie também uma conta no Sandbox, o ambiente de testes do Asaas, em [sandbox.asaas.com](https://sandbox.asaas.com).",
      "A [verificação em duas etapas](/ajuda/verificacao-em-duas-etapas) ativa na sua conta de administrador.",
      "Pelo menos um [plano](/ajuda/planos) criado, com preço maior que zero, e os [documentos legais](/ajuda/documentos-legais) publicados.",
      "O [Cloudflare Turnstile](/ajuda/integracao-turnstile) configurado no servidor. Em uma instalação de produção, o checkout, que é a página de pagamento, fica indisponível sem ele, inclusive nos testes do Sandbox.",
      "De preferência, uma conta do Asaas usada só pela plataforma. O Asaas avisa a plataforma sobre todas as cobranças da conta, e a plataforma só reconhece as que nasceram no checkout dela.",
      "Um computador. O aplicativo do Asaas no celular não tem a área de integrações.",
    ],
    sections: [
      {
        title: "Sandbox ou Produção",
        intro: "O Asaas tem dois ambientes separados, cada um com conta, chave e webhook próprios.",
        list: [
          "**Sandbox** é o ambiente de testes, em `sandbox.asaas.com`. Nada é cobrado de verdade.",
          "**Produção** é o ambiente real, em `www.asaas.com`.",
        ],
        note: "Comece pelo Sandbox, faça uma compra de teste e só então repita as etapas na Produção. As telas são iguais nos dois.",
      },
      {
        title: "1. Gerar a chave de API no Asaas",
        steps: [
          "Entre no Asaas pelo computador, com um usuário administrador da conta.",
          {
            text: "Clique no ícone de pessoa, no canto superior direito (1).",
            image: shot(asaasMenu, 1183, 1008, "Painel do Asaas com o menu do usuário aberto. O número 1 marca o ícone de pessoa no canto superior direito e o número 2 marca o item Integrações.", "O menu do usuário fica no ícone de pessoa, no alto à direita."),
          },
          "No menu que abre, clique em **Integrações** (2).",
          {
            text: "Abra a aba **Chaves de API** (1).",
            image: shot(asaasKeys, 1194, 1008, "Tela Integrações do Asaas. O número 1 marca a aba Chaves de API e o número 2 marca o botão Gerar chave de API.", "A aba Chaves de API, ainda sem nenhuma chave."),
          },
          "Clique em **Gerar chave de API** (2).",
          {
            text: "Em **Nome da chave** (1), escreva um nome que lembre o uso, como `Icarus`.",
            image: shot(asaasNewKey, 1148, 1040, "Janela Gerar chave de API do Asaas. O número 1 marca o campo Nome da chave, o número 2 marca a caixa que permite operações de saque, desmarcada, e o número 3 marca o botão Avançar.", "Os campos de data e hora de expiração ficam em branco."),
          },
          "Deixe **Data de expiração** e **Hora de expiração** em branco. Com uma data definida, a chave para de funcionar naquele dia, e as vendas param junto.",
          "Deixe desmarcada a caixa que permite operações de saque (2). A plataforma só cria cobranças e não precisa dessa permissão.",
          "Clique em **Avançar** (3).",
          "Confirme com o código que o Asaas pedir, enviado por SMS ou gerado no aplicativo dele. No Sandbox, o Asaas orienta usar o código `000000`, conforme a [documentação de testes do Asaas](https://docs.asaas.com/docs/sandbox).",
          "Copie a chave antes de fechar a janela, porque o Asaas só mostra uma vez. Ela começa com `$aact_`, e o cifrão faz parte dela.",
        ],
        note: "Siga direto para a etapa 2, sem copiar mais nada no caminho. Quem perde a chave antes de colar precisa gerar outra.",
      },
      {
        title: "2. Salvar a chave na plataforma",
        steps: [
          "No painel, abra **Configurações**, aba **Integrações**, e escolha **Gateway Asaas**.",
          "Em **Ambiente**, escolha **Sandbox** ou **Produção**, o mesmo da conta em que a chave foi gerada.",
          "Cole a chave em **Chave de API**.",
          "Digite a sua **Senha atual** e clique em **Salvar configuração**.",
        ],
      },
      {
        title: "3. Gerar o token do webhook na plataforma",
        intro: "O webhook é o aviso que o Asaas manda quando um pagamento é confirmado, cancelado ou estornado. O token prova que o aviso veio mesmo do Asaas.",
        steps: [
          "No cartão **Webhook do Asaas**, clique em **Copiar URL do webhook** e cole em um bloco de notas.",
          "Clique em **Gerar token**.",
          "Digite a sua **Senha atual** e clique em **Confirmar e gerar token**.",
          "Clique em **Copiar token do webhook** e cole no mesmo bloco de notas antes de fechar a janela. O token só aparece ali.",
        ],
      },
      {
        title: "4. Abrir o cadastro de webhook no Asaas",
        steps: [
          {
            text: "De volta ao Asaas, em **Integrações**, abra a aba **Webhooks** (1).",
            image: shot(asaasWebhooks, 1316, 911, "Tela Integrações do Asaas. O número 1 marca a aba Webhooks e o número 2 marca o botão Adicionar Webhook.", "A aba Webhooks, antes do primeiro cadastro."),
          },
          "Clique em **Adicionar Webhook** (2).",
        ],
      },
      {
        title: "5. Preencher os dados do webhook",
        intro: "Os números da imagem correspondem aos seis primeiros passos.",
        image: shot(asaasWebhookForm, 1400, 845, "Formulário Adicionar Webhook do Asaas, com seis campos numerados. 1 Nome do Webhook, 2 URL do Webhook, 3 E-mail, 4 Versão da API com v3, 5 Token de autenticação, ainda vazio e ao lado do botão Gerar Token, e 6 Tipo de envio com Sequencial.", "O formulário com dados de exemplo. O campo do token, número 5, ainda está vazio."),
        steps: [
          "Em **Nome do Webhook**, escreva `Icarus`.",
          "Em **URL do Webhook**, cole a URL copiada da plataforma.",
          "Em **E-mail**, informe o seu. O Asaas avisa por ali quando uma entrega falha.",
          "Em **Versão da API**, escolha **v3**.",
          "Em **Token de autenticação**, cole o token copiado da plataforma. Não clique em **Gerar Token**, ao lado do campo, porque ele cria um token diferente e os avisos passam a ser recusados.",
          "Em **Tipo de envio**, escolha **Sequencial**, que entrega os avisos na ordem em que aconteceram.",
          "Confira se os interruptores **Este Webhook ficará ativo ?** e **Fila de sincronização ativada ?** estão ligados.",
        ],
      },
      {
        title: "6. Escolher os eventos e salvar",
        intro: "Ainda no formulário, desça até **Adicionar Eventos**. Os eventos ficam em grupos, e cada grupo abre com um clique.",
        steps: [
          "Abra o grupo **Cobranças**, o primeiro da lista.",
          {
            text: "Marque **PAYMENT_REFUNDED** (1), **PAYMENT_CHARGEBACK_REQUESTED** (2), **PAYMENT_CHARGEBACK_DISPUTE** (3) e **PAYMENT_PARTIALLY_REFUNDED** (4). Eles avisam a plataforma de estornos e contestações.",
            image: shot(asaasPaymentEvents, 1382, 868, "Trecho do grupo de eventos Cobranças no formulário do Asaas, sem o título do grupo, com quatro caixas marcadas. 1 PAYMENT_REFUNDED, 2 PAYMENT_CHARGEBACK_REQUESTED, 3 PAYMENT_CHARGEBACK_DISPUTE e 4 PAYMENT_PARTIALLY_REFUNDED.", "O grupo Cobranças aberto, na altura dos eventos de estorno e contestação."),
          },
          {
            text: "Desça a lista de grupos e abra **Checkouts** (1).",
            image: shot(asaasCheckoutEvents, 1568, 434, "Grupo de eventos Checkouts no formulário do Asaas, marcado com o número 1. Estão marcadas as caixas CHECKOUT_PAID, número 2, CHECKOUT_CANCELED, número 3, e CHECKOUT_EXPIRED, número 4.", "Os três eventos de checkout que a plataforma usa."),
          },
          "Marque **CHECKOUT_PAID** (2), **CHECKOUT_CANCELED** (3) e **CHECKOUT_EXPIRED** (4). É o **CHECKOUT_PAID** que libera o acesso de quem comprou.",
          "Volte ao topo do formulário e clique em **Salvar**.",
          "Apague do bloco de notas a URL e o token.",
        ],
      },
      {
        title: "7. Testar",
        steps: [
          "Na plataforma, confira se o estado mostra **Configurado**. Ele aparece quando o ambiente, a chave e o token estão salvos.",
          "Clique em **Testar conexão**. A tela mostra **Conexão com Asaas confirmada**.",
          "Abra o link de checkout de um plano. Ele é o endereço da sua plataforma seguido de `/checkout?plano=` e do endereço do plano, como mostra [Criar e ajustar planos de assinatura](/ajuda/planos).",
          "Preencha **Nome completo**, **Email** e **CPF ou CNPJ** com os seus dados. O Sandbox envia e-mails de verdade, segundo a [documentação do Asaas](https://docs.asaas.com/docs/sandbox), então use um endereço seu.",
          "Marque o aceite dos termos.",
          "Em **Forma de pagamento**, escolha **Cartão de crédito** e clique em **Continuar para pagamento seguro**.",
          "Na página do Asaas, pague com o cartão de teste. A documentação do Asaas indica o número `4444 4444 4444 4444`, o código `123` e qualquer validade futura.",
          "De volta à plataforma, abra **Pedidos** no painel e confira se a compra aparece como **Pago**.",
        ],
        note: "O teste de conexão confere só a chave de API. O webhook é posto à prova na compra de teste. Os dados do cartão de teste estão nas [perguntas frequentes do Sandbox](https://docs.asaas.com/docs/faq-sandbox), no site do Asaas.",
      },
      {
        title: "8. Ligar as cobranças de verdade",
        intro: "Com o Sandbox funcionando, repita as etapas 1 a 6 na conta de Produção do Asaas, escolhendo **Produção** em **Ambiente**. A URL do webhook muda junto com o ambiente, então copie de novo. Deixe a compra de teste de fora, porque na Produção ela vira uma cobrança real.",
        steps: [
          "Confira no cartão **Turnstile do checkout** se aparece **Segredo configurado no servidor**.",
          "Clique em **Testar conexão**, já com a chave e o token de Produção salvos.",
          "Em **Cobranças em produção**, clique no interruptor.",
          "Confirme só quando quiser vender de verdade, porque a partir daqui as compras geram cobranças reais. Digite a sua **Senha atual** e clique em **Ativar cobranças**.",
        ],
        note: "O interruptor só destrava com um teste aprovado nas últimas 24 horas. Trocar a chave ou o token de Produção desliga as cobranças e pede um teste novo. Trocar o **Ambiente** também desliga as cobranças, mas o teste aprovado nas últimas 24 horas continua valendo.",
      },
    ],
    trouble: [
      ["O teste diz que o Asaas recusou a chave", "A chave foi colada pela metade, ou é de outro ambiente. Confira se o **Ambiente** escolhido na plataforma é o mesmo da conta em que a chave foi gerada e cole de novo, incluindo o cifrão do início."],
      ["O estado continua Não configurado", "Falta o token do webhook. Volte à etapa 3 e gere o token."],
      ["O botão Gerar token está desabilitado", "Salve primeiro o **Ambiente** e a **Chave de API**. O token é gerado para o ambiente salvo."],
      ["O botão Copiar URL do webhook não aparece", "No lugar dele, a tela mostra **Configure a URL pública da API do Supabase no servidor.** Falta essa configuração na instalação. Peça a quem instalou a plataforma para definir o endereço público da API e depois clique em **Atualizar estado**."],
      ["O Asaas recusou o token ao salvar o webhook", "O Asaas tem regras próprias para o formato do token. Na plataforma, clique em **Rotacionar token**, copie o novo e cole de novo no Asaas. Em Produção, essa troca desliga as cobranças. Depois de salvar o webhook, clique em **Testar conexão** e ligue de novo **Cobranças em produção**."],
      ["O checkout diz que o pagamento está indisponível", "São três causas possíveis. Na primeira, o estado do Asaas não chegou a **Configurado**, porque falta o ambiente, a chave ou o token. Na segunda, o ambiente é **Produção** e o interruptor **Cobranças em produção** está desligado. Na terceira, o cartão **Turnstile do checkout** mostra **Segredo não configurado no servidor**, o que trava o checkout em uma instalação de produção. Corrija a que for o seu caso, aguarde um minuto e recarregue a página de pagamento."],
      ["O cliente pagou e o acesso não liberou", "Abra **Pedidos** e procure a compra. Se ela aparece como **Pago**, o aviso do Asaas chegou. O acesso fica ligado à conta que usa o e-mail da compra, então peça ao comprador para entrar com esse e-mail. Se ela não aparece como **Pago**, abra no Asaas **Integrações**, aba **Logs de Webhooks**, e veja se os avisos estão sendo entregues. Confira se a URL e o token são os do ambiente certo e se **CHECKOUT_PAID** está marcado. Se a fila estiver interrompida, edite o webhook e religue **Fila de sincronização ativada ?**."],
      ["O checkout parou depois de meses sem vendas", "Pela [documentação de chaves do Asaas](https://docs.asaas.com/docs/chaves-de-api), a chave que fica três meses sem uso é desabilitada e expira de vez aos seis. Gere uma chave nova, salve na plataforma e clique em **Testar conexão**. Em Produção, ligue de novo **Cobranças em produção**."],
      ["Perdi o token ou a chave", "Nenhum dos dois pode ser lido de novo. Gere outra chave no Asaas, ou use **Rotacionar token** na plataforma, e atualize o outro lado na mesma hora. Em Produção, a troca desliga as cobranças. Clique em **Testar conexão** e ligue de novo **Cobranças em produção**."],
    ],
    related: ["integracao-turnstile", "planos", "pedidos", "integracoes"],
  },
  {
    slug: "integracao-bunny",
    category: "integracoes",
    title: "Hospedar vídeos com o Bunny Stream",
    summary: "O Bunny Stream guarda e transmite os vídeos das aulas. A plataforma assina cada reprodução, e com a proteção por token ligada o vídeo só toca para quem tem acesso à aula.",
    need: [
      "Uma conta no Bunny, criada em [bunny.net](https://bunny.net). O painel deles é em inglês.",
      "A [verificação em duas etapas](/ajuda/verificacao-em-duas-etapas) ativa na sua conta de administrador.",
      "O endereço da sua área de membros, como `membros.seudominio.com.br`.",
    ],
    sections: [
      {
        title: "Os quatro dados que a plataforma pede",
        list: [
          "**ID da biblioteca** é o número que identifica a sua biblioteca de vídeos.",
          "**Chave de API do Stream** permite conferir a biblioteca.",
          "**Hostname da CDN** é o endereço de onde os vídeos saem.",
          "**Chave de autenticação do player** assina cada reprodução.",
        ],
        warn: "O Bunny usa o nome API key em quatro lugares. São duas linhas na página **API** da biblioteca, uma em **Security** e uma na conta. A plataforma usa só duas, a **API Key** da página **API** e a **API key** do cartão **Token authentication key**. Siga as imagens com atenção.",
      },
      {
        title: "1. Criar a biblioteca de vídeos",
        steps: [
          {
            text: "No painel do Bunny, clique em **Stream** (1), no grupo **Delivery** do menu lateral.",
            image: shot(bunnyMenu, 1568, 625, "Painel do Bunny. O número 1 marca o item Stream no menu lateral e o número 2 marca o botão Add Video Library.", "Uma conta pode ter várias bibliotecas. Para a plataforma, uma basta."),
          },
          "Clique em **Add Video Library** (2), no alto à direita. Em uma conta nova, o Bunny mostra no lugar dele um botão para criar a primeira biblioteca.",
          {
            text: "Em **Video library name** (1), dê um nome à biblioteca.",
            image: shot(bunnyName, 1568, 679, "Tela Add video library do Bunny. O número 1 marca o campo Video library name preenchido com Meus cursos.", "O nome é só para você se organizar."),
          },
          "Desça até **Geo replication** e confira as regiões marcadas. Cada uma guarda uma cópia dos vídeos, e algumas já vêm selecionadas.",
          {
            text: "Se os seus alunos estão no Brasil, considere marcar **Sao Paulo (BR)** (2). Decida antes de criar, porque as regiões não podem ser removidas depois.",
            image: shot(bunnyRegions, 1448, 779, "Parte final da seção Geo replication na criação de biblioteca do Bunny, sem o título da seção. O número 2 marca a região Sao Paulo (BR) e o número 3 marca o botão Add Video Library.", "O fim da lista de regiões. Cada região extra tem um custo de armazenamento, mostrado ao lado. Os valores são os da tela em novembro de 2026 e podem mudar."),
          },
          "Clique em **Add Video Library** (3), no fim da página.",
          "Se o Bunny abrir a tela **Enable video library features**, clique em **Skip for now**. Ela oferece **Premium encoding** e **Transcribing**, que vêm desligados e têm preço próprio no quadro **Pricing overview** da tela anterior.",
        ],
      },
      {
        title: "2. Levar o ID, o hostname e a chave de API para a plataforma",
        intro: "Aqui você copia três valores no Bunny e cola cada um na plataforma logo em seguida, para não perder nenhum. Os números em rosa da imagem aparecem entre parênteses nos passos.",
        image: shot(bunnyApi, 1448, 813, "Página API de uma biblioteca do Bunny Stream. O número 1 marca o item API no menu da biblioteca, o número 2 marca o campo Video library ID e o número 3 marca o campo CDN hostname.", "A página API da biblioteca, com valores de exemplo."),
        steps: [
          "Abra a plataforma em outra aba do navegador. No painel, entre em **Configurações**, aba **Integrações**, e escolha **Bunny Stream**.",
          "Na aba do Bunny, abra a biblioteca criada e clique em **API** (1), no menu dela.",
          "Clique no ícone de copiar ao lado de **Video library ID** (2).",
          "Na aba da plataforma, cole o valor em **ID da biblioteca**.",
          "No Bunny, clique no ícone de copiar ao lado de **CDN hostname** (3).",
          "Na plataforma, cole o valor em **Hostname da CDN**.",
          {
            text: "No Bunny, desça até o cartão **API key**. Na linha **API Key** (4), clique no ícone de copiar (5). Não clique nas setas circulares ao lado, porque elas geram uma chave nova e invalidam a atual.",
            image: shot(bunnyApiKey, 1448, 390, "Cartão API key da página API do Bunny Stream. O número 4 marca a linha API Key, com o valor escondido, e o número 5 marca o ícone de copiar. Abaixo fica a linha Read-only API Key.", "A plataforma usa a primeira linha, a API Key."),
          },
          "Na plataforma, cole o valor em **Chave de API do Stream**.",
        ],
        note: "Não salve ainda. Falta a chave do player, que vem na próxima etapa.",
      },
      {
        title: "3. Proteger a biblioteca e levar a chave do player",
        steps: [
          "No Bunny, clique em **Security**, no menu da biblioteca, e depois em **General**.",
          {
            text: "Em **Allowed domains** (1), digite o endereço da sua área de membros, sem `https://`, como em `membros.seudominio.com.br`.",
            image: shot(bunnyDomains, 1461, 812, "Cartão Domains da página Security, General do Bunny Stream. O número 1 marca o campo Allowed domains com membros.seudominio.com.br, o número 2 marca o botão Add e o número 3 marca o interruptor Block direct url file access, ligado.", "Só os domínios da lista conseguem reproduzir os vídeos."),
          },
          "Clique em **Add** (2).",
          "Ligue o interruptor **Block direct url file access** (3), se ele estiver desligado.",
          {
            text: "Desça a página e ligue o interruptor **Embed view token authentication** (1). Com ele ligado, o vídeo só toca com a assinatura que a plataforma gera para quem tem acesso à aula.",
            image: shot(bunnyToken, 1418, 840, "Página Security, General do Bunny Stream. O número 1 marca o interruptor Embed view token authentication, ainda desligado, o número 2 marca a linha API key do cartão Token authentication key e o número 3 marca o ícone de copiar.", "A imagem mostra a tela antes do clique. Depois de ligado, o interruptor 1 fica verde."),
          },
          "Deixe **CDN token authentication**, ao lado, como está. A plataforma não usa essa opção.",
          "No cartão **Token authentication key**, na linha **API key** (2), clique no ícone de copiar (3). Esta chave é diferente da que você copiou na página **API**.",
          "Na aba da plataforma, cole o valor em **Chave de autenticação do player**.",
        ],
        note: "Os interruptores do Bunny valem na hora, sem botão de salvar. O endereço em **Allowed domains** precisa ser igual ao da área de membros, letra por letra, incluindo o `www` se ele fizer parte do endereço.",
      },
      {
        title: "4. Salvar na plataforma e testar",
        steps: [
          "Na aba da plataforma, confira se os quatro campos estão preenchidos.",
          "Digite a sua **Senha atual** e clique em **Salvar configuração**.",
          "Clique em **Testar conexão**. A tela mostra **Conexão com Bunny Stream confirmada**.",
        ],
        note: "O teste confere o ID e a chave de API. A chave do player só é posta à prova quando um vídeo toca, na próxima etapa.",
      },
      {
        title: "5. Enviar um vídeo e usar em uma aula",
        steps: [
          {
            text: "No Bunny, abra **Manage library** e clique em **Add Media** (1) ou em **Upload Video** (2).",
            image: shot(bunnyUpload, 1448, 779, "Página Manage library do Bunny Stream. O número 1 marca o botão Add Media e o número 2 marca o botão Upload Video.", "Em uma biblioteca nova, os dois botões levam ao envio."),
          },
          "Escolha o arquivo e aguarde o processamento.",
          "Abra o vídeo enviado e copie o **Video ID**, um código de 36 caracteres. O menu de três pontos do vídeo também traz **Copy Video ID**.",
          "Na plataforma, edite a aula e cole o código em **Vídeo do Bunny ou link do YouTube**.",
          "Clique em **Salvar conteúdo**. Sem salvar, a prévia mostra a aula como estava antes.",
          "Reabra a aula pelo lápis, clique em **Prévia autorizada da aula** e confira se o vídeo toca.",
        ],
        note: "O caminho completo da aula está em [Colocar vídeo em uma aula](/ajuda/video-da-aula).",
      },
    ],
    trouble: [
      ["O teste diz que a API recusou a chave", "Confira se você copiou a **API Key** da página **API** da biblioteca, a primeira linha do cartão **API key**. A chave da conta, que fica no menu do seu usuário no Bunny, é outra."],
      ["O teste passa, e o vídeo não toca na aula", "Confira a **Chave de autenticação do player**, o domínio em **Allowed domains** e o código do vídeo na aula. O endereço em **Allowed domains** precisa ser igual ao da sua área de membros, sem `https://`. Confira também se a aula foi salva depois de receber o código."],
      ["Ao salvar, aparece Confira o formato deste campo", "O aviso vem do campo **ID da biblioteca**, que só aceita números. Cole o **Video library ID** sem espaços nem letras."],
      ["Ao salvar, aparece Operação não autorizada ou indisponível", "Algum valor está fora do formato. O mais comum é o **Hostname da CDN** colado com `https://` ou com barra no fim. Cole só o endereço, como `vz-1a2b3c4d-567.b-cdn.net`. Confira também se alguma chave foi colada com espaço no meio."],
      ["O estado mostra Com erro e cita o ID da biblioteca ou o hostname", "Esses avisos aparecem quando o valor veio de uma variável de ambiente do servidor, e nesse caso o campo fica travado na tela. Peça a correção a quem instalou a plataforma."],
      ["Os vídeos pararam de tocar de uma hora para outra", "Verifique o saldo da conta no Bunny. Segundo a [documentação do Bunny](https://bunny.net/docs/billing/negative-balance), o serviço funciona com saldo pré-pago, e a conta com saldo negativo é desativada."],
    ],
    related: ["integracoes", "video-da-aula", "criar-curso"],
  },
  {
    slug: "integracao-turnstile",
    category: "integracoes",
    title: "Proteger login e checkout com o Cloudflare Turnstile",
    summary: "O Turnstile é a verificação discreta que separa pessoas de robôs. Ele protege a tela de entrada contra tentativas em massa e o checkout contra compras automatizadas.",
    need: [
      "Uma conta na Cloudflare. Ela oferece o Turnstile em um plano gratuito, descrito na [página de planos](https://developers.cloudflare.com/turnstile/plans/). As imagens deste artigo mostram o painel em inglês, e os passos usam os nomes em inglês.",
      "O endereço da sua área de membros, como `membros.seudominio.com.br`.",
      "Acesso ao servidor da instalação, ou o contato de quem instalou a plataforma para você.",
    ],
    sections: [
      {
        title: "Como funciona",
        intro: "Na Cloudflare, você cria um widget, que é como ela chama a verificação de um site, e recebe duas chaves.",
        list: [
          "A **Site key** é pública. Ela vai na parte da plataforma que roda no navegador.",
          "A **Secret key** é sigilosa. Ela vai só no servidor, que confere cada verificação.",
        ],
        note: "Diferente do Asaas e do Bunny, essas chaves não são coladas no painel. Elas entram na configuração do servidor, e o painel só mostra se o segredo do checkout já está lá.",
      },
      {
        title: "1. Abrir o Turnstile na Cloudflare",
        intro: "Entre em [dash.cloudflare.com](https://dash.cloudflare.com). Os números da imagem correspondem aos passos.",
        image: shot(turnstileMenu, 1530, 784, "Painel da Cloudflare. O número 1 marca o item Application security no menu lateral, o número 2 marca o item Turnstile e o número 3 marca o botão Add widget manually.", "O Turnstile fica dentro de Application security. A lista da imagem já tem um widget de exemplo. Em uma conta nova, ela vem vazia."),
        steps: [
          "No menu lateral, abra **Application security**.",
          "Clique em **Turnstile**.",
          "Clique em **Add widget manually**.",
        ],
      },
      {
        title: "2. Criar o widget",
        intro: "Os números da imagem correspondem aos três primeiros passos.",
        image: shot(turnstileForm, 1229, 980, "Formulário Add Widget do Turnstile. O número 1 marca o campo Widget name, o número 2 marca o campo Hostnames com membros.seudominio.com.br e o número 3 marca o modo Managed, recomendado.", "O formulário preenchido com dados de exemplo."),
        steps: [
          "Em **Widget name**, dê um nome que identifique o uso, como `Área de membros`.",
          "Em **Hostnames**, digite o endereço da sua área de membros, sem `https://`, e clique na sugestão para adicionar.",
          "Em **Widget Mode**, mantenha **Managed**, que é o recomendado. Nesse modo, a Cloudflare decide quando basta conferir em silêncio e quando pedir um clique.",
          "Role até o fim da página e deixe desligada a opção de pre-clearance, no cartão **Skip future security rule challenges for verified visitors**.",
          {
            text: "Clique em **Create** (4).",
            image: shot(turnstileCreate, 1288, 943, "Parte final do formulário Add Widget do Turnstile. O número 3 marca o modo Managed e o número 4 marca o botão Create.", "O fim do formulário, com a opção de pre-clearance desligada."),
          },
        ],
        note: "Cadastrar o domínio principal, como `seudominio.com.br`, já cobre os subdomínios. Cadastrar só `www.seudominio.com.br` não cobre o domínio sem o www.",
      },
      {
        title: "3. Localizar as duas chaves",
        intro: "A Cloudflare mostra as chaves logo depois de criar o widget. Para vê-las de novo, clique nos três pontos do widget e em **Edit Widget**, e desça até **Widget Keys**. Deixe essa página aberta, porque você copia uma chave de cada vez na próxima etapa.",
        image: shot(turnstileKeys, 1456, 813, "Cartão Widget Keys do Turnstile. O número 1 marca o campo Site key, o número 2 marca o campo Secret key, com o valor escondido, e o número 3 marca o botão Show.", "A Secret key vem escondida."),
        list: [
          "**Site key** (1) é a chave pública. Um clique no campo copia o valor.",
          "**Secret key** (2) é a chave sigilosa e vem escondida. O botão **Show** (3) revela o valor para você copiar.",
        ],
        warn: "Trate a **Secret key** como uma senha. Não envie por e-mail comum nem cole em conversas abertas.",
      },
      {
        title: "4. Colocar as chaves na instalação",
        intro: "Esta etapa é de quem tem acesso ao servidor. Se não é o seu caso, envie as duas chaves a essa pessoa por um canal seguro, junto com este artigo. Siga a ordem dos passos. Com o segredo gravado antes de o site ter a **Site key**, ninguém consegue entrar nem comprar.",
        steps: [
          "Copie a **Site key** e grave na variável `VITE_TURNSTILE_SITE_KEY`, usada ao gerar o site da plataforma.",
          "Gere o site de novo e publique.",
          "Abra a tela de entrada publicada em um navegador comum e confira se a verificação aparece abaixo do campo de senha e termina sem erro.",
          "Copie a **Secret key**. No painel do Supabase, abra **Authentication** e depois **Attack Protection**.",
          "Ligue **Enable Captcha protection**.",
          "Em **Choose Captcha Provider**, escolha **Turnstile by Cloudflare**.",
          "Cole a chave em **Captcha secret** e clique em **Save changes**.",
          "Abra uma janela anônima, sem fechar a sessão em que você está, e entre na plataforma com a sua conta. Se a entrada falhar, volte ao Supabase, desligue **Enable Captcha protection** e clique em **Save changes**. O login volta a funcionar sem a verificação, e você revisa as chaves com calma.",
          "Com a entrada funcionando, abra **Edge Functions** e depois **Secrets**, ainda no Supabase. Crie o segredo com o nome `TURNSTILE_SECRET_KEY`, cole a mesma **Secret key** no valor e salve. É ele que protege o checkout.",
        ],
        note: "Esse é o caminho do Supabase hospedado. Em instalação própria, com o Supabase no seu servidor, quem instalou grava o segredo do login na configuração do Auth da própria instalação e o segredo `TURNSTILE_SECRET_KEY` nos segredos das Edge Functions, descritos no guia de operação, em `docs/operations.md`.",
      },
      {
        title: "5. Conferir",
        steps: [
          "No painel, abra **Configurações**, aba **Integrações**, **Gateway Asaas**.",
          "No cartão **Turnstile do checkout**, confira se aparece **Segredo configurado no servidor**.",
          "Se o Asaas já estiver configurado, abra o link de checkout de um plano em uma janela anônima e confira se a verificação aparece no fim do formulário.",
        ],
      },
    ],
    trouble: [
      ["A verificação mostra erro e cita o número 110200", "O endereço da plataforma não está na lista do widget. Na Cloudflare, abra **Edit Widget** e acrescente o endereço em **Hostnames**."],
      ["A verificação não aparece na tela de entrada", "O site foi gerado sem a variável `VITE_TURNSTILE_SITE_KEY`. Grave a **Site key** nela, gere o site de novo e publique."],
      ["Ninguém consegue entrar depois da configuração", "Para destravar, abra o painel do Supabase, em **Authentication**, **Attack Protection**, desligue **Enable Captcha protection** e clique em **Save changes**. A causa costuma ser o segredo gravado antes de o site ter a **Site key**, ou duas chaves de widgets diferentes. Confira se ambas vieram do mesmo widget, publique o site de novo e só então ligue a proteção outra vez."],
      ["O painel mostra Segredo não configurado no servidor", "A **Secret key** ainda não foi gravada nos segredos do servidor com o nome `TURNSTILE_SECRET_KEY`. Enquanto isso, o checkout fica indisponível em uma instalação de produção. Depois de gravar, clique em **Atualizar estado**."],
      ["Preciso trocar a Secret key", "Em **Edit Widget**, no cartão **Widget Keys**, clique em **Rotate Secret Key**. A tela avisa que só dá para trocar uma vez a cada duas horas e que a chave antiga continua valendo enquanto a nova é atualizada. Grave a nova nos dois lugares da etapa 4, o **Captcha secret** do login e o segredo `TURNSTILE_SECRET_KEY` do checkout. Se você trocar só um, o outro para de funcionar quando a chave antiga deixar de valer."],
    ],
    related: ["integracoes", "integracao-asaas", "acesso"],
  },
];
