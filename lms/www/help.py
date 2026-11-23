import frappe
from frappe import _

from lms import __version__

no_cache = 1


def get_context(context):
	context.title = _("Ajuda da área de membros")
	context.no_index = True
	context.metatags = {"robots": "noindex, nofollow"}
	context.lms_version = __version__
	context.help_revision = "2026-11-21 / qualidade 07"
	context.query = str(frappe.form_dict.get("q") or "")[:200].strip()
	context.articles = [
		{
			"id": "aluno",
			"title": _("Sua primeira aula"),
			"steps": [
				_(
					"Abra Cursos e escolha o curso em que você está matriculado. Na página do curso, use Continuar ou abra a primeira aula disponível no conteúdo."
				),
				_(
					"Se o curso for sequencial, conclua a aula anterior para liberar a próxima. Uma prévia pública não libera uma aula futura para quem já está matriculado."
				),
				_(
					"Estude o conteúdo e cumpra a atividade pedida. Confira a indicação de conclusão antes de sair. Um questionário pode ter limite de tentativas; uma falha de rede não deve ser resolvida reenviando repetidamente."
				),
				_(
					"Se aparecer posição de vídeo não salva, você pode continuar assistindo. O maior ponto fica pendente nesta sessão e aula. Use Conferir posição salva e, depois da conferência, Salvar posição pendente. Uma falha de conferência não reenvia a gravação; tente conferir novamente. Isso não reenvia avaliação nem altera sua conclusão acadêmica. O ponto pendente é descartado ao sair da conta; confirme o salvamento antes de sair."
				),
				_(
					"Ao voltar ao mesmo vídeo com a mesma conta, aguarde o carregamento dos metadados para retomar o ponto salvo. Um vídeo já assistido até o fim começa novamente do início para reprodução. Trocar de aula ou conta não transfere o ponto nem a conclusão da aula anterior."
				),
				_(
					"A retomada aceita arquivos de vídeo comprovadamente vinculados à aula, identificadores de YouTube, Vimeo e Bunny e chaves opacas de vídeos externos declarados na aula. Assinaturas temporárias não são guardadas como posição. Alterar a URL de uma fonte externa pode criar uma nova identidade, sem apagar o histórico anterior. Se a fonte não oferecer retomada compatível, a tela informa essa limitação e o vídeo continua disponível; não há promessa de integração ou reprodução externa testada."
				),
				_(
					"Volte ao curso e confirme seu progresso. Se não houver matrícula ou conteúdo disponível, consulte os cursos e turmas oferecidos ou peça acesso ao responsável pela instalação; não há compra automática nesta versão."
				),
			],
		},
		{
			"id": "criador",
			"title": _("Do primeiro curso à primeira aula"),
			"steps": [
				_(
					"Com permissão de criação, abra Cursos e escolha Novo curso. Informe os campos solicitados e salve. O rascunho é seu ponto de partida; criar não significa publicar."
				),
				_(
					"Nos campos com limite de caracteres, confira a contagem abaixo do controle. Se ultrapassar o limite, reduza o texto antes de salvar. A contagem não corta o conteúdo nem apaga o rascunho."
				),
				_(
					"No editor do curso, abra Capítulos no celular e adicione um capítulo. Dentro dele, crie uma aula com um objetivo claro e um conteúdo curto. Salve e aguarde a confirmação."
				),
				_(
					"Abra a prévia da aula, confira textos, arquivos e sequência. Nos controles de mover, escolha o item, o destino e a posição, inclusive por teclado. Confira a nova ordem depois da confirmação. Cancelar conserva a ordem anterior e devolve o foco ao abridor na mesma tela e conta."
				),
				_(
					"A autoria do curso não concede escrita em todas as aulas. Quando a permissão nativa da aula permite apenas leitura, o editor informa o motivo e não tenta salvar alterações. Use Voltar ou a visualização da aula; para editar, procure um responsável com permissão de escrita."
				),
				_(
					"Revise os instrutores, o conteúdo e as opções de publicação. Publique apenas quando estiver pronto. Para conferir a experiência de aluno, use uma conta sintética matriculada; a visão do autor tem permissões diferentes."
				),
				_(
					"O curso de demonstração criado pelo assistente de configuração é sintético. Ele ensina a usar a plataforma e não representa o curso real Geração vAIbe, oferta comercial ou progresso de alunos reais."
				),
			],
		},
		{
			"id": "arquivo",
			"title": _("Arquivar, restaurar e excluir"),
			"steps": [
				_(
					"Despublicar um curso retira sua oferta do catálogo. Arquivar também bloqueia novas matrículas, conservando os registros dos alunos já matriculados."
				),
				_(
					"No curso, abra as opções de arquivamento e leia a confirmação. Para encontrar um curso arquivado, use a lista de cursos criados e o filtro de arquivados. Restaurar conserva os registros e mantém o curso despublicado."
				),
				_(
					"Arquivar uma aula ou capítulo mantém conteúdo e evidências de quem se matriculou antes do corte. Matrícula exatamente no corte ou posterior não recebe esse conteúdo; arquivar o capítulo também afeta as aulas dele. Restaurar preserva o histórico, sem fabricar conclusão."
				),
				_(
					"Excluir definitivamente um curso é excepcional: primeiro arquive, revise cada operação de impacto, obtenha a autorização administrativa solicitada e confirme o identificador exato. Mostrar ou ocultar a senha altera apenas a visibilidade do campo; a senha não é guardada no rascunho. Cancelar não exclui. Exportar um curso não é backup das matrículas ou do progresso."
				),
			],
		},
		{
			"id": "moderacao",
			"title": _("Comentários e aprovação manual"),
			"steps": [
				_(
					"Use Anterior e Próximo para navegar pelos tópicos, em páginas de até 20; as páginas de respostas pertencem somente à discussão aberta. Na aula, um link direto abre a aba Comunidade quando ela está disponível e mostra a discussão autorizada mesmo fora da página atual; sem acesso, o link não libera conteúdo. Se a atualização falhar, tente novamente sem reenviar uma mensagem já salva. Envie sua mensagem na discussão da aula ou na comunidade a que você tem acesso. Ela fica Pendente e ainda não é uma publicação visível para os demais participantes."
				),
				_(
					"Um moderador revisa a fila e decide Aprovar ou Recusar, registrando o motivo. A moderação desta versão é manual; não há análise por IA nem envio dos comentários a um provedor de IA."
				),
				_(
					"Editar uma mensagem aprovada a devolve à revisão. Retirar uma mensagem faz uma remoção lógica, preservando autoria e histórico. As mensagens legadas entram pendentes e não disparam notificações retroativas."
				),
			],
		},
		{
			"id": "comunidade",
			"title": _("Comunidade e vigência anual"),
			"steps": [
				_(
					"Abra Comunidade para ver as comunidades disponíveis à sua conta. A comunidade é independente das discussões de aula e exige uma concessão vigente."
				),
				_(
					"Nesta etapa, o administrador concede os 12 meses. Matricular-se em um curso não cria essa concessão automaticamente; não há checkout, cobrança ou renovação automática ligados aqui."
				),
				_(
					"O acesso começa no instante inicial e termina antes do instante final: o fim é exclusivo. O servidor usa UTC e a interface apresenta as datas em Brasília. Concessões válidas se unem; revogar uma não anula outra ainda vigente."
				),
				_(
					"Se a vigência terminou, informe ao administrador a comunidade e a data exibidas, sem enviar senha. Uma renovação depende de nova concessão administrativa enquanto o checkout estiver adiado."
				),
			],
		},
		{
			"id": "sessao",
			"title": _("Senha, sessão e edição segura"),
			"steps": [
				_(
					"Use a recuperação de senha da tela de entrada. A resposta é genérica para proteger as contas. Links e códigos são pessoais; não os envie a outras pessoas."
				),
				_(
					"Convites administrativos são pessoais, têm prazo e uso único e não liberam o cadastro público. Abra o convite válido, defina a própria senha quando solicitado e entre pela tela de entrada. Se o convite expirou ou foi cancelado, peça outro à administração."
				),
				_(
					"Se a entrada informar que o convite está sendo processado, aguarde um momento e abra novamente o mesmo link. Essa espera não confirma a aceitação nem significa que o convite expirou; não há reenvio automático."
				),
				_(
					"A política desta versão prevê duas horas de inatividade para alunos e trinta minutos para administração, com aviso de sessenta segundos. Use Continuar conectado antes do limite. Vídeo estudado é tratado pelo controle de atividade; polling não deve renovar a sessão."
				),
				_(
					"Após expirar, entre novamente para continuar. Salve quando puder; formulários compatíveis oferecem retomada do rascunho seguro na mesma conta e sessão do navegador, por até 12 horas. Senhas, tokens e arquivos não fazem parte desse rascunho."
				),
			],
		},
		{
			"id": "arquivos",
			"title": _("Enviar e abrir arquivos de aula"),
			"steps": [
				_(
					"No editor da aula, escolha o tipo de conteúdo e envie o arquivo. Aguarde o progresso e a confirmação; cancelar um envio interrompe o pedido. Confira a mensagem específica se o tipo ou tamanho não for aceito."
				),
				_(
					"Use o controle próprio de capa ou avatar para escolher o enquadramento. As políticas de imagens e anexos variam pela finalidade; um limite de avatar não é limite de vídeo didático."
				),
				_(
					"Teste a reprodução e o download na prévia e com um aluno autorizado. Conhecer o endereço de um arquivo privado não concede acesso a uma aula bloqueada. Não torne uma aula pública para contornar um erro de envio."
				),
				_(
					"Conteúdo inserido por YouTube, Vimeo ou outro endereço externo pode contatar esse terceiro ao ser carregado. Consulte a página de privacidade da instalação e use arquivo hospedado localmente quando essa for a opção escolhida."
				),
			],
		},
		{
			"id": "privacidade",
			"title": _("Seus dados e saída de um instrutor"),
			"steps": [
				_(
					"Abra Privacidade para conhecer a informação aprovada da instalação. Os Termos de uso têm uma página separada. Aceitar termos de uso não equivale a consentir com todo tratamento de dados."
				),
				_(
					"Em Seus dados, use o pedido nativo de cópia ou de exclusão. A cópia vai para o endereço da conta. O pedido de exclusão exige verificação do titular e revisão administrativa; não é exclusão imediata de aulas e histórico."
				),
				_(
					"Antes de um instrutor sair, um administrador deve revisar cursos, turmas, autoria compartilhada, avaliações, arquivos e integrações. Transfira a responsabilidade pelos controles nativos e confira o acesso do sucessor antes de retirar o anterior."
				),
				_(
					"O administrador confere o impacto atualizado e confirma o pedido verificado. Aulas, matrículas, progresso e certificados são preservados; dados pessoais em texto livre, arquivos e backups precisam de revisão específica conforme a retenção aprovada."
				),
				_(
					"A cópia inclui os dados pessoais de perfil, contato e currículo profissional declarados pelo titular. Na anonimização aprovada, esses campos e o currículo profissional são redigidos, inclusive nascimento, biografia, redes sociais e referências de imagens. Os arquivos e os vínculos do histórico acadêmico são preservados para a revisão de retenção; isso não apaga textos de toda a plataforma."
				),
				_(
					"Nos campos obrigatórios de competência e setor, [REDACTED] é uma referência técnica de anonimização, não uma qualificação ou setor declarado. Os registros e seus identificadores permanecem vinculados ao perfil anonimizado."
				),
				_(
					"Após confirmar, use Conferir estado da anonimização no pedido. A consulta é manual e não reenvia a operação. Se houver conflito ou falha, confira o estado e gere uma nova prévia antes de confirmar novamente, quando ainda necessário. Um pedido já concluído continua concluído mesmo se outro trabalho concorrente for rejeitado."
				),
			],
		},
		{
			"id": "recuperacao",
			"title": _("Uma tela vazia ou um erro"),
			"steps": [
				_(
					"Ao criar ou renomear uma categoria, aguarde a conferência do nome. Um nome existente impede salvar; falha de consulta oferece Tentar novamente e conserva o texto. A validação do servidor também pode recusar uma colisão ocorrida depois da consulta. Uma busca sem resultados pode estar limitada por título, categoria, período ou estado. Limpe os filtros e confira a conta antes de concluir que o conteúdo foi removido."
				),
				_(
					"No Início, Falha ao carregar os dados pede conferir a conexão e abrir Início novamente; não há reenvio automático. Nas telas que oferecem Tentar novamente, use esse controle. Isso é diferente de não haver registros. Copie o relato reduzido oferecido pela tela, quando disponível, sem senha, token ou dados de outros alunos."
				),
				_(
					"Se o salvamento falhou, mantenha a tela aberta, corrija os campos indicados e tente novamente quando a conexão voltar. Não repita uma ação destrutiva ou uma tentativa de questionário sem conferir seu estado."
				),
			],
		},
		{
			"id": "versao",
			"title": _("Versão, novidades e personalização"),
			"steps": [
				_(
					"Esta ajuda descreve o pacote de qualidade de 21/11/2026, baseado no LMS 16.4.0 e Framework 16.60.2. Se uma opção não aparecer, confira sua permissão e a versão instalada com o responsável pela área."
				),
				_(
					"Icarus Área de Membros é a base reutilizável. Nome, marca, conteúdo e contatos da instalação são definidos pelo responsável; um curso sintético não é uma oferta real. Os créditos e licenças dos componentes permanecem na distribuição."
				),
				_(
					"Nesta edição foram preparados arquivamento, moderação manual, comunidade com concessão administrativa e melhorias de recuperação. Checkout e publicação do LMS continuam para etapa futura."
				),
			],
		},
	]
	context.articles.extend(
		[
			{
				"id": "avaliacoes",
				"title": _("Avaliações, tentativas e certificados"),
				"steps": [
					_(
						"Antes de iniciar uma avaliação, leia as instruções, os critérios e o limite de tentativas. Não abra um tour durante uma tentativa cronometrada ou monitorada; a orientação fica disponível antes dela."
					),
					_(
						"No questionário, responda e envie uma única vez. Se houver falha, confira o estado antes de repetir. Tarefas e exercícios de programação têm submissão e retorno próprios; concluir um tour não envia resposta nem altera nota."
					),
					_(
						"Se outra tentativa mudar durante o envio, suas respostas ficam preservadas e a tela consulta as tentativas atuais. Use Conferir tentativas se a consulta falhar. Confira o limite e a tentativa registrada antes de decidir enviar novamente; o sistema não reenvia automaticamente."
					),
					_(
						"O criador prepara questões, instruções ou casos de teste no editor nativo e confere a prévia autorizada. Aguarde a confirmação do salvamento, inclusive quando ele for automático."
					),
					_(
						"Para certificação, cumpra os requisitos exibidos no curso ou turma e acompanhe o pedido ou a avaliação disponíveis. O currículo elegível e as regras de aprovação são conferidos no servidor; o guia não emite certificado. Na programação, aguarde o indicador de carregamento. Se houver erro, use Tentar novamente; uma agenda vazia só é confirmada depois da consulta."
					),
				],
			},
			{
				"id": "turmas",
				"title": _("Turmas, encontros e comunicados"),
				"steps": [
					_(
						"Abra a turma e confira os cursos, datas e participantes. O aluno encontra seu currículo; a administração usa as abas de alunos, presença e acompanhamento conforme a permissão."
					),
					_(
						"Ao incluir um aluno, curso ou avaliação, confira o destino e salve pelo controle próprio. O tour não concede matrícula e não cria a concessão anual de comunidade."
					),
					_(
						"Para um encontro, confira data, hora, fuso e conta de videoconferência antes de salvar. Conta não configurada precisa ser conectada pelo responsável. Aguarde confirmação antes de considerar a reunião criada."
					),
					_(
						"Antes de um comunicado, revise conteúdo e destinatários. Modelos de e-mail só aceitam as variáveis disponíveis no contexto e precisam de teste renderizado em sandbox; o tour não envia mensagens."
					),
				],
			},
			{
				"id": "relatorios",
				"title": _("Ler indicadores e exportar"),
				"steps": [
					_(
						"Confira o período e o fuso exibidos no painel. Abra Selecionar período, escolha um intervalo válido e use Aplicar período; Cancelar conserva o filtro anterior. Use os mesmos filtros para card, lista de composição e exportação; conclusão pedagógica acumulada é diferente de matrícula no período."
					),
					_(
						"Abra a lista que explica o indicador. Verifique numerador, denominador, paginação e o significado de base zero antes de interpretar uma comparação."
					),
					_(
						"Escolha o formato disponível e confira o arquivo completo. A página visível pode ser só uma parte do conjunto; exportar curso não é backup de matrículas, progresso ou certificados. Nas análises de curso e turma, o PDF em A4 distribui o conteúdo em páginas; confira todas as colunas e os cabeçalhos repetidos."
					),
					_(
						"Nos registros das estatísticas, o título e a tabela identificam o indicador escolhido. Matrículas não são pessoas únicas; um relatório sem funil não deve ser lido como funil de conclusão."
					),
				],
			},
			{
				"id": "importacao",
				"title": _("Importar com o assistente nativo"),
				"steps": [
					_(
						"Com permissão, abra Importação e escolha o tipo de registro. Use o modelo oferecido e confira o mapeamento de colunas antes de carregar o conjunto completo."
					),
					_(
						"Revise os erros e os exemplos no assistente antes de confirmar. Não considere o pedido concluído enquanto o servidor não informar o resultado da importação."
					),
					_(
						"Para pacotes de curso, use a importação específica e valide os arquivos e a autoria no destino. Dados pessoais, matrículas e progresso não devem ser tratados como conteúdo sintético de demonstração."
					),
				],
			},
			{
				"id": "perfil",
				"title": _("Perfil, senha e agenda"),
				"steps": [
					_(
						"Abra seu perfil pelo menu da conta. Use Editar para corrigir nome e dados necessários e o controle de imagem para conferir a foto. Salve e aguarde a confirmação."
					),
					_(
						"Senha e segundo fator têm controles próprios. Não coloque credenciais ou códigos na biografia. Em falha, preserve a entrada e siga a retomada segura disponível."
					),
					_(
						"O menu Aplicativos aparece somente para contas de sistema autorizadas, após os dados do perfil carregarem. Se a lista falhar, use Tente novamente no próprio menu. Sair ou trocar de conta descarta a lista anterior; essa lista não concede acesso a outro aplicativo."
					),
					_(
						"Se você avalia alunos, confira disponibilidade, fuso e os agendamentos no perfil de avaliador. Na agenda, use Tab para alcançar o encontro e Enter ou Espaço para abrir seus detalhes; o nome completo identifica o encontro. A agenda pedagógica segue a disponibilidade real configurada; o guia não fabrica horários de atendimento."
					),
				],
			},
			{
				"id": "tour",
				"title": _("Usar os tours e interpretar o acompanhamento"),
				"steps": [
					_(
						"O painel Primeiros passos da administração é uma lista de configuração separada do tour. Use Tab e Enter ou Espaço nas ações disponíveis. Pular e Redefinir são controles separados e não abrem a tarefa. Etapas concluídas ou dependentes mostram seu estado e pré-requisito. Ao abrir um formulário, a ação de origem continua visível para receber o foco ao cancelar. Fechar devolve o foco ao controle que abriu o painel; minimizar conserva a lista sem deixar ações ocultas na navegação por teclado. Expandir e Recolher controlam a barra lateral pelo teclado ou toque. Mais abre ou recolhe as páginas existentes; Nova página é uma ação separada, disponível somente com permissão. No celular, use as entradas de Cursos, Turmas, Você e o passo a passo da tela; o checklist lateral é específico do desktop. Nenhuma dessas ações conclui aulas."
					),
					_(
						"Na tela logada, escolha Passo a passo desta tela. Em formulários, o mesmo guia fica dentro da janela para preservar o foco. O guia é opcional e não executa a operação por você."
					),
					_(
						"Leia a orientação e use Mostrar na tela para focar o controle real. Próximo passo também funciona com Alt e seta para a direita. Voltar revê um passo já alcançado. Se um alvo estiver ausente, abra o painel necessário ou retome depois; não há conclusão automática."
					),
					_(
						"Fechar ou Escape pausa e devolve o foco ao botão que abriu o guia, enquanto a mesma tela e conta continuarem ativas; mudança de tela também pausa o acompanhamento. Pular é uma escolha separada. Ao concluir ou pular, responda Este tour te ajudou? se quiser; não responder não conta como Não."
					),
					_(
						"A administração abre Acompanhamento dos tours e filtra a página. Os registros pertencem à pessoa autenticada e à instalação atual. As taxas mostram participações de pessoa por página e revisão, com numerador e denominador; conclusão de tour não representa aula concluída."
					),
				],
			},
		]
	)
	if context.query:
		needle = context.query.casefold()
		context.articles = [
			article
			for article in context.articles
			if needle in (article["title"] + " " + " ".join(article["steps"])).casefold()
		]
	return context
