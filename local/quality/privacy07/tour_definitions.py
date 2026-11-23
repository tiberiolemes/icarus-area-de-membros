"""Versioned product tours and a complete named-route inventory, no runtime data."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def step(target, text):
	return {"target": target, "text": text}


def main():
	tours = {
		"catalogue": [
			step(
				'[data-tour="list-filters"], [data-testid="mobile-filters-button"]',
				"Busque pelo título e ajuste os filtros. Um resultado vazio pode vir dos filtros, não da exclusão do seu curso.",
			),
			step(
				'[data-tour="list-results"]',
				"Abra o curso desejado para conferir o conteúdo e sua matrícula. Se ainda não houver cursos, volte à busca ou consulte a administração; este guia não concede matrícula.",
			),
		],
		"home": [
			step(
				'[data-tour="first-result"], h1',
				"Comece pelo curso em que você está matriculado. O guia inicial explica como abrir a primeira aula disponível. Se aparecer Falha ao carregar os dados, confira a conexão e abra Início novamente; uma falha não significa que seus registros foram removidos.",
			),
			step(
				'a[href*="/courses/"], a[href$="/courses"]',
				"Abra um curso ou a lista de cursos. Estude a aula, cumpra a atividade e confira o progresso no curso; concluir este tour não conclui uma aula.",
			),
		],
		"course": [
			step(
				"h1, h2",
				"Confira o curso, sua matrícula e o progresso. A visão do instrutor tem permissões diferentes da visão de aluno.",
			),
			step(
				'[data-tour="course-outline"], a[href*="/learn/"]',
				"No conteúdo, escolha a primeira aula liberada ou use Continuar. Em curso sequencial, cumpra o pré-requisito antes de avançar.",
			),
		],
		"editor": [
			step(
				'[data-tour="course-editor"]',
				"Organize o curso em capítulos e aulas. Criar um rascunho não publica conteúdo para os alunos.",
			),
			step(
				'[data-tour="course-outline"], [data-tour="lesson-editor"]',
				"Use o conteúdo lateral ou Capítulos no celular para criar ou escolher a aula. Nos controles de mover, escolha o item, o destino e a posição; Cancelar conserva a ordem anterior e devolve o foco ao abridor na mesma tela e conta. Salve uma aula curta e confira sua prévia. Se o painel estiver recolhido, abra-o antes de mostrar este passo.",
			),
		],
		"course_settings": [
			step(
				'[data-field="title"], input',
				"Revise o nome, a apresentação e os instrutores do curso. Preserve nomes próprios e confirme o salvamento antes de sair. Fechar o guia pausa a orientação e devolve o foco ao botão que o abriu na mesma tela e conta.",
			),
			step(
				'[data-tour="course-lifecycle"]',
				"Arquivar mantém aulas, matrículas e histórico e bloqueia novas matrículas. Restaurar mantém o curso despublicado. A exclusão permanente é separada, com operações de impacto identificadas e reautenticação. Mostrar ou ocultar a senha altera só a visibilidade do campo; este tour não preenche nem registra credenciais ou executa essas ações.",
			),
		],
		"lesson_editor": [
			step(
				'[data-tour="lesson-editor"]',
				"Escreva a aula no editor e envie os materiais pelo controle próprio. Espere a confirmação do envio; arquivo de aula não deve ser tornado público para contornar falha.",
			),
			step(
				'[data-tour="lesson-editor"]',
				"Confira conteúdo, prévia e salvamento. Notas de instrutor são privadas. A permissão da aula pode permitir só leitura, mesmo com autoria do curso: use Voltar ou a visualização da aula; editar exige permissão nativa de escrita. Se estiver arquivado, restaure a hierarquia necessária antes de editar; sair do tour não descarta o rascunho.",
			),
		],
		"lesson": [
			step(
				"h1, h2, video, iframe",
				"Leia ou reproduza a aula disponível. Uma URL conhecida não libera aula futura nem arquivo privado. Ao retomar, aguarde os metadados do vídeo; a posição salva pertence à mesma conta, aula e fonte. Vídeo já concluído recomeça do início para reprodução. Se o ponto do vídeo ficar pendente, continue assistindo e use Conferir posição salva; depois escolha Salvar posição pendente. Não é preciso reenviar respostas de avaliação.",
			),
			step(
				'[data-tour="discussion"], [data-tour="course-outline"], video, iframe',
				"Conclua a atividade indicada e confira o progresso. Comentários entram em revisão manual; notas e materiais privados mantêm suas permissões. Abrir este guia não consome tentativa nem marca conclusão.",
			),
		],
		"course_form": [
			step(
				'[data-tour="form-fields"]',
				"Informe o título e a apresentação do curso, escolha a categoria existente ou crie a categoria no próprio controle. Aguarde a conferência do nome da categoria; nome existente impede criar, e falha permite tentar novamente sem perder o texto. O rascunho é separado da publicação.",
			),
			step(
				'[data-tour="form-actions"]',
				"Revise os campos e a contagem de caracteres onde houver limite. Corrija os erros indicados no campo e aguarde a confirmação. Depois crie capítulo e aula; o tour não salva nem publica automaticamente.",
			),
		],
		"chapter_form": [
			step(
				'[data-tour="form-fields"]',
				"Nomeie o capítulo que agrupará as aulas e confira o curso de destino. A ordem e os vínculos fazem parte do currículo.",
			),
			step(
				'[data-tour="form-actions"]',
				"Salve e confirme o retorno ao conteúdo do curso. Arquivar capítulo preserva a evidência das matrículas elegíveis; excluir definitivamente não faz parte desta ação.",
			),
		],
		"batch_form": [
			step(
				'[data-tour="form-fields"]',
				"Defina a turma, suas datas, cursos e instrutores. Uma turma reúne estudantes; não altera automaticamente a vigência da comunidade.",
			),
			step(
				'[data-tour="form-actions"]',
				"Confira os dados e salve. Depois inclua os alunos autorizados e planeje os encontros. Revisar esta tela não envia convites por conta própria.",
			),
		],
		"enrollment": [
			step(
				'[data-tour="form-fields"]',
				"Escolha a pessoa e confira o curso, a turma ou o programa exibido. Permissão de matrícula e conteúdo arquivado são conferidos pelo servidor.",
			),
			step(
				'[data-tour="form-actions"]',
				"Revise o destino antes de confirmar. Matrícula em curso e concessão anual de comunidade são registros distintos; este tour não cria acesso nem cobrança.",
			),
		],
		"assessment_form": [
			step(
				'[data-tour="form-fields"], [data-tour="authoring-form"]',
				"Defina a avaliação, as instruções e as questões ou critérios esperados. Revise limites e tentativas antes de disponibilizar aos alunos.",
			),
			step(
				'[data-tour="form-actions"], [data-tour="authoring-form"]',
				"Aguarde a confirmação do salvamento do rascunho e confira as respostas ou casos de teste pela visão autorizada e faça a prévia com conta sintética. O guia não envia tentativa nem altera nota.",
			),
		],
		"profile": [
			step(
				'h1, h2, [role="tablist"]',
				"Confira o perfil, certificados e atividades da pessoa exibida. Dados de outros alunos continuam sujeitos às permissões da área.",
			),
			step(
				'input, [role="tablist"], h1, h2',
				"Para corrigir seu próprio perfil, use Editar. Senha e segundo fator usam controles próprios; não inclua códigos, tokens ou dados de outras pessoas na biografia. Aplicativos é um menu restrito a contas de sistema autorizadas; se a leitura falhar, use Tente novamente na própria lista. Trocar de conta descarta a lista anterior.",
			),
		],
		"profile_form": [
			step(
				'[data-field="first_name"], [data-tour="form-fields"]',
				"Revise seu nome e os dados de perfil necessários. Escolha a foto no controle próprio e confira o enquadramento.",
			),
			step(
				'[data-tour="form-actions"]',
				"Salve e aguarde a confirmação. Se houver falha, preserve a entrada e use a retomada segura; senha e códigos de verificação não são guardados no rascunho.",
			),
		],
		"list": [
			step(
				'[data-tour="list-filters"], [data-testid="mobile-filters-button"]',
				"Use a busca e os filtros desta lista para encontrar o registro necessário. Limpar filtros é diferente de recuperar uma falha de carregamento.",
			),
			step(
				'[data-tour="list-results"]',
				"Abra a linha para ver o registro antes de agir. Use a paginação para o restante; o total da lista e o recorte visível podem ser diferentes.",
			),
		],
		"batch": [
			step(
				'h1, h2, [role="tablist"]',
				"Confira os cursos, estudantes e datas desta turma. Use as abas pertinentes ao seu papel para preparar as atividades ou acompanhar seu estudo.",
			),
			step(
				'[role="tablist"], [data-tour="discussion"], h2',
				"Abra a lista que explica um indicador e confira o período. Presença, progresso e certificado têm critérios próprios; uma concessão de comunidade não nasce automaticamente da turma.",
			),
		],
		"report": [
			step(
				'[data-tour="report"], [role="tablist"], h1',
				"Leia o período e o fuso declarados antes de comparar indicadores. Em Selecionar período, escolha um intervalo válido e use Aplicar período; Cancelar conserva o filtro anterior. Matrícula, conclusão, presença e comunidade medem fatos diferentes.",
			),
			step(
				'[data-tour="report"], table',
				"Abra a composição do número e use os mesmos filtros ao exportar. Confira o indicador no título e na tabela do arquivo; matrículas não são pessoas únicas. Base zero não significa crescimento de cem por cento; o conjunto completo pode exceder a página visível. Nas análises de curso e turma, confira todas as colunas e páginas do PDF em A4.",
			),
		],
		"community_posts": [
			step(
				'[data-tour="community-posts"]',
				"Abra uma discussão da comunidade vigente. As concessões são administrativas e usam início inclusivo e fim exclusivo, exibidos em Brasília.",
			),
			step(
				'[data-tour="discussion"]',
				"Navegue pelos tópicos com Anterior e Próximo, até 20 por página; as respostas têm sua própria paginação. Na aula, um link direto abre a aba Comunidade quando disponível; a discussão continua exigindo acesso, inclusive fora da página atual. Uma nova mensagem abre sua discussão autorizada. Após falha de leitura, tente novamente sem reenviar a mensagem salva. Envie a mensagem somente quando estiver pronta. Ela entra Pendente; editar conteúdo aprovado devolve à revisão. O tour não publica mensagem nem renova acesso.",
			),
		],
		"community_inactive": [
			step(
				'[data-tour="community-posts"]',
				"Confira o estado e as datas das suas concessões. O histórico dos cursos continua preservado mesmo sem vigência na comunidade.",
			),
			step(
				'[data-tour="community-posts"]',
				"Peça à administração a revisão da concessão exibida. Há união de concessões válidas; não há checkout ou renovação automática nesta etapa.",
			),
		],
		"moderation": [
			step(
				'[data-tour="moderation-queue"]',
				"Escolha o estado da fila e leia a mensagem antes de decidir. Só aprovadas ficam publicadas para os demais participantes.",
			),
			step(
				'[data-tour="moderation-queue"]',
				"Registre o motivo ao aprovar ou recusar. Editar uma aprovada volta à revisão; retirar é lógico e mantém autoria. Confirme uma decisão real fora do tour, que não aprova nem notifica automaticamente.",
			),
		],
		"grants": [
			step(
				'[data-tour="community-grants"]',
				"Escolha o membro e confira a janela de concessão. O início vale e o instante final já não vale; as datas são apresentadas em Brasília.",
			),
			step(
				'[data-tour="community-grants"]',
				"Revise antes de conceder ou revogar. Concessões válidas se unem e revogar uma não revoga as demais. O tour não concede, renova ou cobra.",
			),
		],
		"imports": [
			step(
				'[data-tour="import"]',
				"Escolha o tipo de registro e use o modelo do assistente nativo. Confira o mapeamento e as linhas de exemplo antes de importar.",
			),
			step(
				'[data-tour="import"]',
				"Revise erros e o resultado confirmado pelo servidor. Exportação de curso não é restauração de matrículas ou histórico; o tour não importa arquivo nem inicia escrita.",
			),
		],
		"course_import": [
			step(
				'[data-testid="course-import-fields"]',
				"Selecione um ZIP exportado pelo próprio curso. O assistente de registros em planilha é outro fluxo; confira a origem do arquivo antes do envio.",
			),
			step(
				'[data-tour="form-actions"]',
				"Confira o arquivo e só então use Importar, se desejar continuar. O ZIP não restaura matrículas ou progresso. Este tour não envia arquivo nem executa a importação.",
			),
		],
		"member_form": [
			step(
				'[data-tour="form-fields"]',
				"Confira a pessoa e conceda somente os papéis necessários. A pessoa define a própria senha pelo convite ou recuperação nativos. Convites administrativos não abrem o cadastro público nem aprovam as políticas da instalação. Se a entrada informar processamento em andamento, aguarde e reabra explicitamente o mesmo link; isso não significa convite expirado.",
			),
			step(
				'[data-tour="form-actions"]',
				"Antes da saída de instrutor, revise autoria, integrações e retenção no pedido nativo de privacidade. Não apague histórico para remover acesso; o tour não salva papéis nem desativa contas.",
			),
		],
		"privacy_settings": [
			step(
				'[data-fieldname="controller_name"]',
				"Preencha o responsável real e o canal de privacidade da instalação. Não use contato ou empresa de exemplo.",
			),
			step(
				'[data-fieldname="purposes_and_bases"], [data-fieldname="retention_policy"]',
				"Defina finalidades, bases, retenção e prestadores reais. Preserve aulas e registros de aprendizagem; a aprovação técnica não é revisão jurídica.",
			),
			step(
				'[data-fieldname="publication_approved"]',
				"Revise também os termos em Configurações de aprendizagem. Só aprove quando todas as informações forem válidas; mudar os textos invalida a revisão anterior. O tour não aprova nem habilita cadastro.",
			),
		],
		"privacy_request": [
			step(
				'[data-fieldname="email"]',
				"Confira o titular e aguarde a verificação do pedido pelo e-mail nativo. Criar ou confirmar o pedido não apaga automaticamente os registros.",
			),
			step(
				'[data-fieldname="status"]',
				"O pedido precisa estar aguardando aprovação. Abra Revisar impacto de privacidade para revisar dependências e registros retidos. Após confirmar, use Conferir estado da anonimização; a consulta manual não reenvia a operação. Se houver conflito, confira o estado e revise uma nova prévia antes de outra confirmação necessária. O tour não executa a anonimização.",
			),
		],
		"privacy_impact": [
			step(
				'[data-fieldname="confirmation"]',
				"Leia a prévia de impacto, incluindo perfil, contato e currículo profissional que serão anonimizados. Competência e setor obrigatórios usam a referência técnica [REDACTED], não dados profissionais reais. Referências de imagens são retiradas; arquivos e vínculos acadêmicos ficam para a revisão de retenção. Transfira a autoria e reconecte integrações necessárias. Depois gere uma prévia atualizada, antes de digitar o identificador.",
			),
			step(
				'[data-fieldname="retention_note"]',
				"Revise texto livre, arquivos e backups segundo a retenção aprovada e registre o escopo sem credenciais ou dados alheios. Confirmar anonimização é uma ação separada e explícita; o tour não a executa.",
			),
		],
		"help_usage": [
			step(
				'[data-tour="tour-report-filters"]',
				"Filtre a página e a revisão para interpretar o acompanhamento do site atual. Você vê registros individuais somente com permissão administrativa.",
			),
			step(
				'[data-tour="tour-report-results"]',
				"As taxas usam participações de pessoa por página, não alunos únicos de toda a plataforma. Conclusão de tour não é conclusão de curso; ausência de avaliação não é resposta negativa.",
			),
		],
	}
	pages = {}
	tours.update(
		{
			"creator_home": [
				step(
					'[data-tour="creator-home"]',
					"Comece por criar um curso ou revisar um dos cursos que você já criou. O checklist de configuração nativo permanece disponível à administração. Se aparecer Falha ao carregar os dados, confira a conexão e abra Início novamente; uma falha não significa que seus registros foram removidos.",
				),
				step(
					'a[href*="/courses/"]',
					"Abra o curso ou Novo curso para preparar capítulo e aula. Confira a prévia com conta sintética de aluno antes de publicar; concluir este guia não publica conteúdo.",
				),
			],
			"evaluator_home": [
				step(
					'[data-tour="creator-home"]',
					"Confira os encontros e avaliações sob sua responsabilidade. A visão de avaliador não concede automaticamente permissão de criar cursos. Se aparecer Falha ao carregar os dados, confira a conexão e abra Início novamente; uma falha não significa que seus registros foram removidos.",
				),
				step(
					'a[href*="/user/"], [data-tour="creator-home"]',
					"Abra o agendamento disponível para conferir data e fuso. Aguarde o indicador de carregamento; se houver erro, use Tentar novamente. Na agenda, alcance o encontro com Tab e use Enter ou Espaço para abrir seus detalhes. Se a consulta terminar sem agendamento, revise sua disponibilidade pelo perfil de avaliador; o guia não agenda nem atribui nota.",
				),
			],
			"student_programs": [
				step(
					'[data-tour="student-programs"]',
					"Escolha a aba de programas em que você está inscrito ou dos programas disponíveis. Um programa reúne cursos numa trilha.",
				),
				step(
					'[data-tour="student-programs"]',
					"Abra um programa para conferir os cursos e sua ordem. Se a aba estiver vazia, confira a inscrição com a administração; o guia não cria matrícula.",
				),
			],
			"empty_list": [
				step(
					'[data-tour="list-results"]',
					"Esta lista está vazia. Confira o motivo exibido: filtros sem resultado, ausência de registros ou falta de acesso não são o mesmo estado.",
				),
				step(
					'[data-tour="list-results"]',
					"Se houver filtros, limpe-os pelo controle disponível. Crie um registro somente se a tela oferecer essa ação ao seu papel; o guia não cria exemplos nem concede permissão.",
				),
			],
			"program": [
				step(
					"h1, h2",
					"Um programa reúne cursos numa trilha. Confira os cursos e a ordem antes de iniciar.",
				),
				step(
					'a[href*="/courses/"], h2',
					"Abra o curso disponível da trilha e acompanhe o progresso. A conclusão considera o currículo elegível; concluir um tour não altera esse resultado.",
				),
			],
			"program_form": [
				step(
					'[data-tour="form-fields"]',
					"Nomeie o programa e escolha os cursos da trilha na ordem desejada. Preserve os responsáveis que continuarão editando o programa.",
				),
				step(
					'[data-tour="form-actions"]',
					"Salve e confira a trilha. Inclua os membros pela ação própria; o tour não matricula pessoas nem publica cursos.",
				),
			],
			"live_class": [
				step(
					'[data-tour="form-fields"]',
					"Defina título, data, hora e fuso do encontro e confira a conta de videoconferência configurada. Não suponha que uma conta ausente já está conectada.",
				),
				step(
					'[data-tour="form-actions"]',
					"Revise turma, convidados e horário antes de salvar. O encontro só está pronto após a confirmação do serviço; este tour não cria reunião nem dispara convites.",
				),
			],
			"announcement": [
				step(
					'[data-tour="form-fields"]',
					"Escreva o comunicado para a turma correta. Confira o título e o conteúdo antes de enviá-lo aos participantes.",
				),
				step(
					'[data-tour="form-actions"]',
					"Revise a ação e o público indicados na tela. O guia não envia anúncio nem notificação; só a confirmação da operação real pode fazê-lo.",
				),
			],
			"email_template": [
				step(
					'[data-tour="form-fields"]',
					"Prepare o assunto e o corpo do modelo de e-mail. Use apenas as variáveis disponíveis no contexto da turma.",
				),
				step(
					'[data-tour="form-actions"]',
					"Revise o texto e salve o modelo. Depois valide o e-mail renderizado em sandbox; salvar um modelo não comprova entrega ao destinatário.",
				),
			],
			"job_form": [
				step(
					'[data-tour="authoring-form"]',
					"Revise título, organização e descrição da oportunidade. Publique somente informações reais e autorizadas.",
				),
				step(
					'[data-tour="authoring-form"]',
					"Confira os campos e a confirmação de salvamento. Candidaturas têm fluxo próprio; o tour não publica vaga nem envia dados de candidatos.",
				),
			],
			"submission": [
				step(
					'h1, h2, [data-tour="submission"]',
					"Confira a avaliação e a submissão exibidas. Seu acesso ao conteúdo e ao retorno do avaliador continua sendo conferido pelo servidor.",
				),
				step(
					'[data-tour="submission"], h2',
					"Leia o estado e o retorno antes de reenviar ou iniciar outra tentativa. Um guia não envia resposta, não consome tentativa e não altera a nota.",
				),
			],
			"assessment_link": [
				step(
					'[data-tour="form-fields"]',
					"Escolha o tipo e o registro de avaliação que deve compor a turma. Confira o vínculo e os dados exibidos.",
				),
				step(
					'[data-tour="form-actions"]',
					"Revise e confirme o vínculo. O guia não cria questões nem atribui nota aos estudantes.",
				),
			],
			"certificate": [
				step(
					"h1, h2",
					"Confira o curso e os critérios exibidos para certificação. Progresso visual antigo não substitui os requisitos atuais do currículo elegível.",
				),
				step(
					"form, h2",
					"Siga o pedido ou a avaliação que a tela oferecer, se você tiver permissão. O tour não emite certificado nem inventa conclusão ou agendamento.",
				),
			],
		}
	)

	def assign(names, tour, article, audience="signed"):
		for name in names.split():
			pages[name] = {"tour": tour, "article": article, "audience": audience}

	assign("Home", "home", "aluno")
	assign("Home:creator", "creator_home", "criador", "author")
	assign("Home:evaluator", "evaluator_home", "perfil")
	assign("Programs:student", "student_programs", "aluno")
	assign("Courses", "catalogue", "aluno")
	assign("CourseDetail", "course", "aluno")
	assign("CourseDetail:editor", "editor", "criador", "author")
	assign("CourseDetail:settings", "course_settings", "arquivo", "author")
	assign("CourseDetail:dashboard BatchDetail:dashboard Statistics", "report", "relatorios", "author")
	assign("Lesson SCORMChapter", "lesson", "aluno")
	assign("LessonForm", "lesson_editor", "arquivos", "author")
	assign("NewCourse", "course_form", "criador", "author")
	assign("ChapterForm", "chapter_form", "criador", "author")
	assign("NewBatch", "batch_form", "turmas", "author")
	assign(
		"NewCourseEnrollment NewBatchStudent NewBatchCourse ProgramEnrollment",
		"enrollment",
		"turmas",
		"author",
	)
	assign(
		"Batches Programs Quizzes Assignments ProgrammingExercises Questions Jobs CertifiedParticipants QuizSubmissions AssignmentSubmissions ProgrammingExerciseSubmissions JobApplications",
		"list",
		"recuperacao",
	)
	assign("BatchDetail", "batch", "turmas")
	assign("ProgramDetail", "program", "aluno")
	assign("CourseCertification", "certificate", "avaliacoes")
	assign("ProfileEvaluator ProfileEvaluationSchedule", "profile", "perfil")
	assign("Profile ProfileAbout ProfileCertificates ProfileRoles MobileYou", "profile", "perfil")
	assign("ProfileEditForm", "profile_form", "perfil")
	assign(
		"NewQuiz QuizForm NewAssignment AssignmentForm NewProgrammingExercise ProgrammingExerciseForm",
		"assessment_form",
		"avaliacoes",
		"author",
	)
	assign("NewAssessment", "assessment_link", "avaliacoes", "author")
	assign("NewLiveClass", "live_class", "turmas", "author")
	assign("NewAnnouncement", "announcement", "turmas", "author")
	assign("NewBatchEmailTemplate", "email_template", "turmas", "author")
	assign("JobForm", "job_form", "criador", "author")
	assign("ProgramForm", "program_form", "criador", "author")
	assign("QuizSubmission AssignmentSubmission ProgrammingExerciseSubmission", "submission", "avaliacoes")
	assign("Community Community:posts", "community_posts", "comunidade")
	assign("Community:inactive", "community_inactive", "comunidade")
	assign("Community:queue", "moderation", "moderacao", "community_admin")
	assign("Community:grants", "grants", "comunidade", "community_admin")
	assign("DataImportList NewDataImport DataImport", "imports", "importacao", "author")
	assign("CourseImport", "course_import", "importacao", "author")
	assign("MemberForm", "member_form", "privacidade", "manager")
	assign("DeskPrivacySettings", "privacy_settings", "privacidade", "manager")
	assign("DeskPrivacyRequest", "privacy_request", "privacidade", "manager")
	assign("DeskPrivacyImpact", "privacy_impact", "privacidade", "manager")
	assign("HelpUsage", "help_usage", "tour", "community_admin")
	for name, entry in list(pages.items()):
		if entry["tour"] in {"list", "catalogue"}:
			pages[name + ":empty"] = {**entry, "tour": "empty_list"}
	excluded = {
		"Setup": "Fluxo nativo obrigatório de configuração/primeira senha já guiado; tour opcional não deve disputar foco ou autorizar pulo da etapa de segurança.",
		"Billing": "Checkout adiado por decisão explícita. Não apresentar uma jornada de pagamento como disponível nem conduzir escrita comercial.",
		"QuizPage": "Execução de questionário pode ser cronometrada/proctorada. Não mover foco ou sobrepor controle durante tentativa; instruções ficam antes da tentativa e em /help#avaliacoes. Conflito de envio preserva respostas e consulta tentativas; falha da consulta permite somente conferir novamente, sem reenvio automático.",
		"BulkCertificates": "Operação em lote já possui diálogo nativo de prévia/confirmação; orientação fica na turma e na ajuda, sem outro controle que desvie foco da autorização.",
		"NotFound": "Estado de endereço inexistente usa recuperação nativa; não há operação de produto a concluir nem alvo válido para tour.",
		"JobDetail": "Página informativa pública nativa, sem coleta adicional pelo tour. A operação de candidaturas permanece na lista/formulário autorizado.",
	}
	data = {
		"revision": "2026-11-21-quality07",
		"tours": tours,
		"pages": pages,
		"exclusions": excluded,
		"states_without_separate_tour": {
			"native_onboarding_checklist": "Primeiros passos usa sua lista nativa, com ações principais e Pular/Redefinir separados, estados e pré-requisitos acessíveis. Formulários conservam o abridor visível para cancelar com retorno de foco; Expandir/Recolher usa botão nativo. Mais abre/recolhe páginas existentes e Nova página é uma ação separada, sem alternar a lista nem mudar permissões. No celular, os primeiros resultados e tours usam as entradas móveis, sem checklist lateral. A ajuda /help#tour explica teclado, minimizar e fechar; não sobrepor outro tour ao painel nem contabilizar ações de configuração como conclusão acadêmica.",
			"video_position_pending": "O tour da aula e o artigo aluno explicam a conferência e o salvamento explícito. O aviso pendente só aparece após falha real e não é alvo obrigatório de um tour comum; guia nenhum reenvia posição ou avaliação.",
			"purge_credentials": "Senha e aprovação01 usam diálogo seguro próprio; o guia contextual explica a prévia, mas não interfere nos campos de credenciais nem os registra.",
			"password_and_2fa": "Fluxos04 têm passos e validação próprios; não disputar foco com criação de senha, fator ou recovery code.",
			"upload_crop": "Diálogos nativos de arquivo e recorte permanecem operacionais; a aula tem tour e artigo de arquivos, sem clicar/cancelar envio automaticamente.",
			"loading_or_error": "O alvo só existe quando seu conteúdo real está disponível. Aguardar/retry ou pular explicitamente; não contabilizar uma tela de skeleton como concluída.",
		},
		"state_policy": "Erro, loading, sem permissão ou alvo ausente nunca completam passo; retomar depois ou pular explicitamente. FormShell hospeda o mesmo componente dentro da área modal; não há tour do framework Desk inteiro.",
	}
	output = ROOT / "lms/public/tours/quality07.json"
	output.parent.mkdir(parents=True, exist_ok=True)
	output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
	assert all(p["tour"] in tours for p in pages.values())
	assert not set(pages) & set(excluded)
	print(json.dumps({"tours": len(tours), "pages_and_states": len(pages), "exclusions": len(excluded)}))


if __name__ == "__main__":
	main()
