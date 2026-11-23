"""Reconcile source receipts without changing the coordinator's ledger/history."""

import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
AUDIT = ROOT / "docs/audit/quality"
RECEIPTS = {
	"01": "evidence/01-backend-integrity.json",
	"02": "docs/audit/quality/evidence/02-forms-drafts-feedback.json",
	"03": "docs/audit/quality/evidence/03-operations-recovery.json",
	"04": "docs/audit/quality/04-auth-session.json",
	"05": "docs/audit/quality/05-ux-data-presentation.json",
	"06": "docs/audit/quality/06-community-moderation.json",
	"11": "docs/audit/quality/evidence/11-child-content-lifecycle.json",
}
CHANGED_APPLICABILITY = {
	"BD-07": "Os novos estados de arquivo01/11 e moderação06 têm consumidores reais; o baseline histórico não muda.",
	"SE-06": "A purga excepcional01/05 introduziu reautenticação com senha de autorização; consultar também04.",
	"SG-09": "Os caminhos de autorização de mídia e currículo elegível mudaram01/11; há inventário de perdas/preservações no relatório01.",
	"EN-13": "A recuperação deixou de ser só condicional:03 implementou e ensaiou captura/restore segregados; nova captura da integração08 ainda necessária.",
	"HT-07": "O DS Icarus foi efetivamente entregue/publicado pela frente10, fora do runtimeLMS. O recibo10 só comprova esse artefato.",
}
OWN = {
	"ON-01",
	"ON-03",
	"ON-02",
	"ON-04",
	"ON-05",
	"ON-06",
	"ON-07",
	"ON-09",
	"NA-01",
	"FE-09",
	"TX-01",
	"TX-03",
	"TX-05",
	"TX-06",
	"TX-07",
	"TX-08",
	"TX-10",
	"TX-12",
	"VI-02",
	"KP-07",
	"SG-06",
	"SG-10",
	"SG-12",
	"SG-13",
	"FO-01",
	"EN-03",
	"EN-10",
	"EN-11",
	"PR-10",
}
CHECKS = {
	"backup_schema": "Proteger DB/arquivos/configuração; restore03 atual; aplicar todos os patches/metadados e provar no-op em site existente/novo, MRO/handlers e retorno seguro sem apagar histórico.",
	"session": "HTTP real de senha/recuperação/convite/2FA e limites7200/1800; clienteWebSocket persistente independente com contraprova válida após logout/revogação/desativação.12 não implementou correção do servidor.",
	"access_lifecycle": "Matriz de papéis via REST/list/count/bytes/SCORM/URLs conhecidas; sequência, prévia, matrícula antes/igual/depois do corte, arquivo/restauração de curso/capítulo/aula, purga reautenticada e concorrênciaMariaDB, preservando evidências.",
	"forms": "Formulários/diálogos reais: rótulo/erro/foco, loading e repetição, validação dinâmica, sessão/rede, draft/dirty guard e retorno semreload, sem guardar senha/token nem reenviar quiz automaticamente.",
	"reports": "Períodos/fuso/limites, composição card/lista/exportação, denominadores por currículo elegível e basezero; sort antes de paginação, CSV/XLSX/PDF cheios/seguros e contraste de gráficos.",
	"community": "Fila manualpendente/aprovado/recusado, edição/revisão/retirada, legado e notificação única; concessões administrativas anuais, uniãoUTC/fim exclusivo, revogação e conta sem vigência. Semcheckout/IA.",
	"privacy": "Contrato07: configuração incompleta, aceite falso e rotasirmãs negados; login/convites preservados; cópia privada só do titular; pedido assinado, prévia/cancelamento, transferência, retenção, job/rollback/concorrência e links/histórico conservados.",
	"help": "Abrir ajuda/artigos/privacidade/termos/pedido fora da sessão; busca/feedbackAJAX, primeira aula de aluno/criador, sínteseversuscurso real e novidades com preferência nativa por usuário. Tours por página/estado com alvo real, conclusão/pulo/avaliação e painel autorizado; testar nativamente duas sessões, rota/retomada, teclado e alvos em desktop/celular. Teste leigo observado e screenshots reais permanecem08.",
	"visual_i18n": "ArtefatoSPA/Desk atual: 390px/desktop, todos os estados relevantes, foco/teclado/leitor, contraste medido, alvos44px/tipo16px, marca/configuração, singular/plural/interpolação e catálogos novos. Não inferir pelo token ou detector de fonte.",
	"media": "Arquivos/imagens/recorte/original/avatares com policies05+File01/11; limites reais, progressocancelamento, mídia privada versus legado público e reprodução completa sem bypass.",
	"email": "E-mails em sandbox recebidos/renderizados com remetente/marca/links atuais, destinatário correto e ausência de segredo em logs; não enviar a destinatário externo.",
	"operations_release": "Saúde/job/scheduler e falhas observáveis, versão/assets/aba/cache da mesmaimagem; segurança/dados sensíveis e benchmark com ambiente. CI/release próprio, licenças e requisitos do destino são condicionais à próxima autorização.",
}
OBSERVED = {
	"FO-10": (
		[".local/i18n-apps/frappe/frappe/core/doctype/user/user.py", "lms/lms/user.py"],
		"Normalização strip/lower e validação nativas de User preservadas; cadastro genérico passa pelo controller. Teste real de e-mail e formulários08 ainda necessário.",
	),
	"FO-22": (
		["frontend/src/components/RichTextEditor.vue", "frontend/src/pages/Forms/AssignmentForm.vue"],
		"Editor visual nativo preservado nos consumidores e regressões02; não foi substituído por campoHTML cru.",
	),
	"FO-24": (
		[
			"frontend/src/pages/Forms/ProgrammingExerciseForm.vue",
			"lms/lms/doctype/lms_assignment_submission/lms_assignment_submission.json",
		],
		"Campos de tipo/situação continuam seleções nativas e IDs de estado não foram traduzidos.",
	),
	"SE-05": (
		["docs/audit/quality/04-auth-session.json"],
		"SE-05 consta explicitamente em preserved_rules04; não presumir aceitação de provedor social não configurado.",
	),
	"LI-07": (
		[
			"frontend/src/components/Discussions.vue",
			"frontend/src/components/DiscussionReplies.vue",
			"docs/audit/quality/06-community-moderation.md",
		],
		"Contrato05 consumido06: paginação nativa das listas e conversa3/10 em fonte, sem trocar paginação por filtragem local.",
	),
	"LI-08": (
		[
			"frontend/src/components/DiscussionReplies.vue",
			"docs/audit/quality/contracts/06-community-moderation.md",
		],
		"Conversa abre com recorte curto e pagina no servidor; expandir histórico não publica conteúdo pendente.",
	),
	"LI-15": (
		["frontend/src/components/DiscussionReplies.vue", "docs/audit/quality/06-community-moderation.md"],
		"Compositor/conversa, moderação e retirada lógica foram entregues06 com testes isolados próprios; foco/posição/realtime reais08 pendentes.",
	),
	"LI-12": (
		["frontend/src/pages/DataImport.vue", "lms/www/help.py"],
		"Wizard nativo preservado; ajuda própria orienta primeira criação e erros sem oferecer importador ou conteúdo fictício. Importação real ainda deve ser homologada08.",
	),
	"NA-02": (
		["frontend/src/components/Sidebar/UserDropdown.vue", "frontend/src/pages/MobileYou.vue"],
		"Perfil/tema/configuração/sair continuam no menu de conta e equivalente móvel; sessão04 foi preservada.",
	),
	"NA-03": (
		[
			"frontend/src/components/Layouts/DesktopLayout.vue",
			"frontend/src/components/Sidebar/AppSidebar.vue",
		],
		"Layout usa uma instância de AppSidebar e toggle nativo;07 não criou segunda barra lateral.",
	),
	"NA-04": (
		[
			"frontend/src/composables/useDirtyGuard.ts",
			"frontend/src/composables/useFormRoute.ts",
			"docs/audit/quality/02-forms-drafts-feedback.md",
		],
		"Retorno/guarda02 preservados e links07 abrem ajuda em nova aba para não perder edição; histórico real08 ainda precisa de prova.",
	),
	"IM-03": (
		["frontend/index.html", "lms/tiberio_i18n.py"],
		"Shell possui metaOG/Twitter e identidade/favicons de configuração nativa; conferir rotas/arquivos e versões servidas08, sem fabricar imagem social.",
	),
	"TX-04": (
		["docs/icarus/DISTRIBUTION.md", "docs/audit/quality/WORKING-AGREEMENT.md"],
		"Nome formal Tibério preservado;07 não renomeia conteúdo autoral nem instalação.",
	),
	"TX-09": (
		["docs/audit/quality/WORKING-AGREEMENT.md", "docs/audit/quality/evidence/07-before-shared.json"],
		"Mesclas07 autorizadas e delimitadas; conteúdo pedagógico/identidade pessoal não foi substituído por texto inventado.",
	),
	"CO-01": (
		[
			"lms/templates/emails/privacy_request_confirmation.html",
			"lms/templates/emails/privacy_anonymization_completed.html",
			"lms/lms/day1_email.py",
		],
		"Novo fluxo usa templatesHTML e envio/branding nativos; recebimento sandbox08 continua necessário para os demais gatilhos.",
	),
	"CO-09": (
		["docs/audit/quality/contracts/07-privacy-help.md", "lms/lms/privacy.py"],
		"Pedidos usam os mecanismos/e-mail nativos; nenhum canal externo ou contato de suporte foi inventado.",
	),
	"PR-04": (
		["local/bootstrap.py", "lms/lms/privacy.py", "docs/audit/quality/WORKING-AGREEMENT.md"],
		"Signup/mail/telemetria locais permanecem como configurados; cleanup destrutivo legado negado, checkout/IA não ativados.",
	),
	"PR-10": (
		["lms/lms/doctype/lms_privacy_settings/lms_privacy_settings.json", "docs/icarus/DISTRIBUTION.md"],
		"Informação legal e identidade variáveis por instalação ficam em configuração nativa, sem novo sistema de temas.",
	),
	"SG-05": (
		["lms/lms/privacy.py", "lms/lms/moderation.py", "lms/lms/media.py"],
		"Entradas novas têm allowlists/tipos/rate limits, HTML sanitizado e autoridade de servidor; não comprova toda a superfície da aplicação.",
	),
	"SG-11": (
		["lms/lms/permissions.py", "lms/lms/lesson_files.py", "lms/lms/privacy.py"],
		"Mídia continua no gate privado01/11; cópia de dados usa File privado e link assinado nativos. URL conhecida não amplia autoridade.",
	),
	"SG-16": (
		[
			"lms/tests/security/test_privacy_lifecycle.py",
			"lms/tests/test_privacy_isolated.py",
			"docs/audit/quality/06-community-moderation.json",
		],
		"Regressões positivas/negativas foram entregues nas frentes; suite nativa integrada e revisão independente08 continuam gates de segurança.",
	),
	"PF-05": (
		[
			"docs/audit/quality/contracts/05-outline-cache.md",
			"frontend/src/tests/qualityOutlineCache.test.ts",
		],
		"Snapshots/variantes de outline e invalidação possuem contrato e regressões05/11; asset/cache do release exige prova08.",
	),
	"BD-02": (
		["lms/lms/report_period.py", "lms/lms/moderation.py", "lms/lms/privacy.py"],
		"Novas consultas usam parâmetros/QueryBuilder e filtros de titular; backend01/05/06/11 preservado. SQL/MariaDB/planos reais pendem08.",
	),
	"VE-06": (
		[
			"docs/audit/quality/01-backend-integrity.md",
			"docs/audit/quality/11-child-content-lifecycle.md",
			"docs/audit/quality/contracts/07-privacy-help.md",
		],
		"Causas e consumidores documentados: gate de mídia, currículo elegível e envioIP em helper compartilhado; não apenas sintoma deUI.",
	),
	"VE-08": (
		[
			"docs/audit/quality/WORKING-AGREEMENT.md",
			"docs/audit/quality/evidence/07-python-source.log",
			"docs/audit/quality/evidence/07-vitest-final.json",
		],
		"Cada frente deixa regressões/recibo; revisão final independente08 ainda falta, sem promover tests isolados a aceite integrado.",
	),
	"EN-08": (
		["docs/audit/quality/WORKING-AGREEMENT.md", "docs/audit/quality/evidence/07-before-shared.json"],
		"Ownership, assentamento das frentes e autorização de mesclas delimitadas documentados;07 não lançou workers concorrentes.",
	),
	"EN-09": (
		["docs/icarus/DISTRIBUTION.md"],
		"Nenhum commit/push07; preparação preserva histórico upstream e exige identidade certa antes da publicação futura.",
	),
	"SI-02": (
		["frontend/src/routes.js", "lms/www/help.html", "lms/www/privacy.html"],
		"Rotas daSPA e ajuda pública sem extensão na URL; cold links e fallback do proxy precisam deHTTP08.",
	),
	"SI-12": (
		["docs/audit/quality/WORKING-AGREEMENT.md", "docs/audit/quality/07-help-privacy-completeness.md"],
		"Fonte07 exclusivamente local; DS10 tem publicação separada autorizada e não publicaLMS.",
	),
	"HT-12": (
		[
			"docs/audit/quality/07-coverage-candidate.json",
			"docs/audit/quality/07-help-privacy-completeness.md",
		],
		"Candidato porregra e relatório de acompanhamento distinguem source/isolado/runtime/bloqueios; ledger continua exclusivo do coordenador.",
	),
}
PROCESS_RULES = {
	"AG-01",
	"AG-03",
	"AG-04",
	"AG-05",
	"AG-06",
	"AG-07",
	"AG-10",
	"AG-11",
	"AG-12",
	"AG-13",
	"AG-14",
	"AG-15",
	"AG-16",
}


def read(path):
	return json.loads((ROOT / path).read_text())


def group(rule):
	family = rule.split("-")[0]
	if rule in {"SG-06", "SG-10", "SG-12", "SG-13"}:
		return "privacy"
	if family == "SE":
		return "session"
	if family == "ON":
		return "help"
	if family in {"DT", "KP", "LI"}:
		return "reports"
	if family in {"FO", "FE"}:
		return "forms"
	if family in {"MO", "SG", "BD"} or rule == "PR-12":
		return "access_lifecycle"
	if family == "IA":
		return "community"
	if family == "IM":
		return "media"
	if family == "CO":
		return "email"
	if family in {"VI", "TX", "NA"}:
		return "visual_i18n"
	return "operations_release"


def main():
	baseline_path = AUDIT / "baseline-assessment.json"
	baseline = json.loads(baseline_path.read_text())
	active = [row for row in baseline["rules"] if row["nivel"] != "proposta"]
	proposals = [row for row in baseline["rules"] if row["nivel"] == "proposta"]
	assert len(active) == 294 and len(proposals) == 7
	claims = {}
	for front, path in RECEIPTS.items():
		for claim in read(path).get("rules", []):
			ids = claim.get("ids") or [claim.get("rule_id") or claim.get("id")]
			for rule in ids:
				if rule:
					claims.setdefault(rule, []).append({"front": front, "receipt": path, "claim": claim})
	for rule in OWN:
		claims.setdefault(rule, []).append(
			{
				"front": "07",
				"receipt": "docs/audit/quality/07-help-privacy-completeness.md",
				"claim": {
					"status": "implemented_source",
					"scope": "ajuda/onboarding/privacidade/distribuição no recorte07; testes isolados nas fronteiras pertinentes",
					"evidence": [
						"docs/audit/quality/contracts/07-privacy-help.md",
						"docs/audit/quality/evidence/07-python-source.log",
						"docs/audit/quality/evidence/07-vitest-final.json",
						"docs/audit/quality/evidence/07-vitest-broad.json",
						"docs/audit/quality/evidence/07-tour-route-map.json",
						"docs/audit/quality/evidence/07-public-source.log",
					],
				},
			}
		)
	for rule, (paths, note) in OBSERVED.items():
		claims.setdefault(rule, []).append(
			{
				"front": "07-source-review",
				"receipt": "docs/audit/quality/07-help-privacy-completeness.md",
				"claim": {"status": "implemented_source", "scope": note, "evidence": paths},
			}
		)
	for rule in PROCESS_RULES:
		claims.setdefault(rule, []).append(
			{
				"front": "07-process-review",
				"receipt": "docs/audit/quality/07-help-privacy-completeness.md",
				"claim": {
					"status": "implemented_source",
					"scope": "Recorte processual observado: acordo/spec/contratos, consulta do contexto, mescla autorizada, testes e limites explícitos. Não é aceite do produto nem conclusão do trabalho do coordenador.",
					"evidence": [
						"docs/audit/quality/WORKING-AGREEMENT.md",
						"docs/audit/quality/contracts/07-privacy-help.md",
						"docs/audit/quality/07-help-privacy-completeness.md",
					],
				},
			}
		)
	applicable, not_applicable = [], []
	historical_na = []
	for rule in active:
		identifier = rule["id"]
		if rule["status"] == "nao_aplicavel":
			historical_na.append(
				{
					"id": identifier,
					"historical_reason": rule["motivo"],
					"current_applicability": "applicable"
					if identifier in CHANGED_APPLICABILITY
					else "not_applicable",
				}
			)
			if identifier not in CHANGED_APPLICABILITY:
				not_applicable.append(
					{
						"id": identifier,
						"title": rule["titulo"],
						"status": "not_applicable",
						"reason": rule["motivo"],
						"scope_evidence": "docs/audit/quality/baseline-assessment.json",
						"reassess_if": rule["aceite"],
					}
				)
				continue
		current_claims = claims.get(identifier, [])
		states = [entry["claim"].get("state", entry["claim"].get("status")) for entry in current_claims]
		status = (
			"verified_isolated"
			if "verified_isolated" in states
			else "implemented_source"
			if "implemented_source" in states
			else "blocked"
		)
		row = {
			"id": identifier,
			"title": rule["titulo"],
			"level": rule["nivel"],
			"baseline_status": rule["status"],
			"current_applicability": "applicable",
			"applicability_change": CHANGED_APPLICABILITY.get(identifier),
			"status": status,
			"status_scope": "source_subscope_only",
			"full_rule_closed": False,
			"integrated_verified": False,
			"source_receipts": current_claims,
			"baseline_evidence_historical_only": rule["evidencias"],
			"acceptance": rule["aceite"],
			"remaining": rule["acao_recomendada"] + " " + rule["aceite"],
			"runtime_checks": [group(identifier)],
			"blocker_kind": "integrated_acceptance_pending"
			if status != "blocked"
			else "no_current_receipt_or_acceptance_unverified",
		}
		# Routing entries in05 are not approved scope reductions or proof of implementation.
		if any(state == "scope_adjusted" for state in states):
			row["routing_note"] = (
				"Claims scope_adjusted de roteamento não fecham a regra; apenas decisões explícitas abaixo ajustam escopo."
			)
		if identifier == "IA-06":
			row.update(
				status="scope_adjusted",
				blocker_kind="manual_moderation_runtime_pending",
				scope_decision="Aprovação manual substituiIA por decisão explícita do usuário; fonte06, sem provedorIA.",
				runtime_checks=["community"],
				remaining="Homologar a fila manual06 no artefato integrado; não reivindicar moderaçãoIA.",
			)
		if identifier in {"PR-11", "BD-03"}:
			row.update(
				status="scope_adjusted",
				blocker_kind="deferred_by_user",
				scope_decision="Checkout/cobrança adiados para a etapa do servidor. Preço exibido não é venda homologada.",
				remaining="Manter desabilitado; escolher/contratar integração e só na etapa autorizada comprovar assinatura/replay/valor/moeda/reembolso/revogação, sem gateway ou cobrança fictícios.",
			)
		if identifier == "AG-09":
			row.update(
				status="scope_adjusted",
				blocker_kind="explicit_task_boundary",
				scope_decision="Esta frente recebeu proibição explícita de memória/Obsidian e não executaMEMCC. O coordenador consolida quando autorizado.",
				remaining="Preservar recibos locais; não gravar memória nemObsidian para aumentar cobertura desta tarefa.",
			)
		if identifier in {"EN-01", "EN-07", "VE-05"}:
			row.update(
				status="scope_adjusted",
				blocker_kind="release_stage_not_authorized_here",
				scope_decision="07 é fechamento de fonte local; integração08 e publicaçãoLMS não foram executadas nem autorizadas por esta tarefa.",
				remaining="Provar artefato/versão/aba/assets após integração local08; gates de publicação ficam para autorização posterior. Não publicar só para marcar a regra.",
			)
		if identifier in {"SE-15", "SE-16"}:
			row.update(
				status="blocked",
				blocker_kind="known_server_source_gap",
				source_gap="12 encontrou entrega em salasSocket.IO existentes sem revalidação de sessão. Não há correção de servidor neste recibo.",
				remaining="Fechar a causa do servidor e provar negativa pós-revogação/inatividade com cliente persistente independente daUI, mantendo contraprova válida, tenant e Authorization.",
				extra_evidence=[
					"docs/audit/quality/12-websocket-session.md",
					"docs/audit/quality/12-websocket-session.json",
				],
			)
		if identifier == "ON-03":
			row.update(
				status="verified_isolated",
				blocker_kind="integrated_acceptance_pending",
				source_scope="Tour único por operação/página/estado, foco real e controles nativos; conclusão/pulo/avaliação separados; persistência nativa por ator/site e painel administrativo com denominadores reais. Mapa completo das rotas nomeadas e exclusões específicas entregue.",
				remaining="08 deve migrar o DocType e integrar os assets, provar permissões em duas sessões e cada alvo aplicável em desktop/celular, incluindo modal, rota, pausa, retomada e alvo ausente. A fonte e testes isolados não equivalem a homologação visual ou nativa.",
				extra_evidence=[
					"frontend/src/components/GuidedTour.vue",
					"lms/lms/tours.py",
					"lms/lms/doctype/lms_tour_progress/lms_tour_progress.json",
					"docs/audit/quality/evidence/07-tour-route-map.json",
					"docs/audit/quality/evidence/07-tours-targeted.json",
					"docs/audit/quality/evidence/07-regression-final.json",
					"docs/audit/quality/evidence/07-tour-import-final.json",
					"docs/audit/quality/evidence/07-vitest-broad.json",
					"docs/audit/quality/evidence/07-tours-python.log",
				],
			)
		if identifier == "DT-12":
			row.update(
				status="blocked",
				blocker_kind="visual_acceptance_unverified",
				remaining="Validar calendário denso com dados sintéticos em390px/desktop, legibilidade/foco e sequência real. Ausência de screenshot é falta de prova, não bloqueio externo.",
			)
		if identifier in {"SG-10", "SG-12", "SG-13"}:
			row["production_configuration_blockers"] = [
				"controlador e canal reais",
				"finalidades/bases",
				"retenção porcategoria/backups/textolivre",
				"prestadores/regiões/transferências",
				"termos/aviso aprovados pelo responsável",
			]
		if identifier == "HT-07":
			row.update(
				status="verified_integrated",
				status_scope="public_DS10_only_not_LMS",
				integrated_verified=True,
				runtime_checks=[],
				blocker_kind=None,
				source_receipts=[
					{"front": "10", "receipt": "docs/audit/quality/evidence/10-icarus-ds-release.json"}
				],
				remaining="Recibo10 comprova somente oDS publicado. Não transfere homologação visual nem licenciamento para oLMS.",
			)
		if identifier == "EN-12":
			row.update(
				status="blocked",
				blocker_kind="future_distribution_owner_decision",
				remaining="Definir repositório/identidade técnica e escopo MIT do código próprio frente à licençaAGPL herdada, preservar avisos e inventariar transitivas/CloudSDK. Não háGitHub próprio publicado; ver docs/icarus/DISTRIBUTION.md.",
			)
		if row["status"] == "scope_adjusted":
			row.setdefault("extra_evidence", []).extend(
				[
					"docs/audit/quality/WORKING-AGREEMENT.md",
					"docs/audit/quality/tasks/07-help-privacy-completeness.md",
				]
			)
		applicable.append(row)
	assert len(historical_na) == 65
	assert len(applicable) + len(not_applicable) == 294
	assert len({r["id"] for r in applicable + not_applicable}) == 294
	result = {
		"schema_version": 1,
		"task": "07",
		"placement": "local",
		"kind": "coverage_candidate_not_ledger_update",
		"baseline_sha256": hashlib.sha256(baseline_path.read_bytes()).hexdigest(),
		"source_only_LMS": True,
		"full_LMS_acceptance": False,
		"counts": {
			"active_rules": 294,
			"historical_not_applicable": 65,
			"current_applicable": len(applicable),
			"current_not_applicable": len(not_applicable),
			"unapproved_proposals": 7,
			"applicable_source_status": dict(Counter(r["status"] for r in applicable)),
		},
		"historical_not_applicable": historical_na,
		"current_not_applicable": not_applicable,
		"unapproved_proposals": [
			{"id": r["id"], "title": r["titulo"], "status": "unapproved_proposal", "reason": r["motivo"]}
			for r in proposals
		],
		"runtime_checks": CHECKS,
		"applicable_rules": applicable,
		"receipt_inputs": RECEIPTS,
		"warnings": [
			"Não somar suítes finais, deltas e execuções históricas como testes únicos.",
			"Status de fonte/isolado prova apenas o recorte citado, não o aceite global.",
			"Pendência de código ou prova não foi convertida em requisito atendido nem bloqueio externo.",
			"Ledger e relatórios históricos não foram alterados por07.",
		],
	}
	output = AUDIT / "07-coverage-candidate.json"
	output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
	loaded = json.loads(output.read_text())
	assert len(loaded["applicable_rules"]) + len(loaded["current_not_applicable"]) == 294
	assert all(r["runtime_checks"] or r["id"] == "HT-07" for r in applicable)
	print(json.dumps(result["counts"], ensure_ascii=False))


if __name__ == "__main__":
	main()
