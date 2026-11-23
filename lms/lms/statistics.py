"""Statistics and their record lists share one population, cut and permission."""

from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import get_system_timezone
from pypika import functions as fn

from lms.lms.permissions import is_site_administrator
from lms.lms.report_period import REPORT_ZONE, previous_window, report_window, within
from lms.lms.utils import has_moderator_role

METRICS = {
	"courses": (
		"LMS Course",
		[["published", "=", 1], ["upcoming", "=", 0], ["is_archived", "=", 0]],
		"title",
	),
	"users": ("User", [["enabled", "=", 1], ["name", "not in", ["Administrator", "Guest"]]], "full_name"),
	"enrollments": ("LMS Enrollment", [], "member_name"),
	"completions": ("LMS Enrollment", [], "member_name"),
	"certifications": ("LMS Certificate", [["published", "=", 1]], "member_name"),
}


def _access():
	if not (is_site_administrator() or has_moderator_role()):
		frappe.throw(_("Sem permissão para consultar estatísticas da instalação."), frappe.PermissionError)


def _population(metric, window):
	if metric not in METRICS:
		frappe.throw(_("Indicador inválido."))
	doctype, filters, title = METRICS[metric]
	return doctype, within(filters, "creation", window), title


def _completion_query(window):
	from lms.lms.child_content import completed_enrollments_query

	enrollment = frappe.qb.DocType("LMS Enrollment")
	query = frappe.qb.from_(enrollment).where(enrollment.name.isin(completed_enrollments_query()))
	query = query.where(enrollment.creation < window["upper"])
	if window["lower"]:
		query = query.where(enrollment.creation >= window["lower"])
	return query, enrollment


def _completion_count(window):
	query, enrollment = _completion_query(window)
	return query.select(fn.Count(enrollment.name)).run()[0][0]


def _completion_records(window, search, field, direction, start, page_length):
	query, enrollment = _completion_query(window)
	if search.strip():
		pattern = "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
		query = query.where(
			enrollment.member_name.like(pattern)
			| enrollment.name.like(pattern)
			| enrollment.member.like(pattern)
		)
	total = query.select(fn.Count(enrollment.name)).run()[0][0]
	rows = query.select(
		enrollment.name,
		enrollment.member_name.as_("title"),
		enrollment.creation,
		enrollment.member,
		enrollment.course,
	)
	order = frappe.qb.asc if direction == "asc" else frappe.qb.desc
	rows = rows.orderby(enrollment[field], order=order).orderby(enrollment.name, order=order)
	if page_length:
		rows = rows.limit(page_length)
	if start:
		rows = rows.offset(start)
	return rows.run(as_dict=True), int(total)


@frappe.whitelist()
def get_statistics(from_date=None, to_date=None):
	_access()
	window = report_window(from_date, to_date)
	previous = previous_window(window)
	counts, comparison, series = {}, {}, {}
	for metric in METRICS:
		doctype, filters, title = _population(metric, window)
		counts[metric] = (
			_completion_count(window)
			if metric == "completions"
			else frappe.db.count(doctype, filters=filters)
		)
		if previous:
			old_type, old_filters, _title = _population(metric, previous)
			old = (
				_completion_count(previous)
				if metric == "completions"
				else frappe.db.count(old_type, filters=old_filters)
			)
			comparison[metric] = {
				"previous": old,
				"percent": (counts[metric] - old) * 100 / old if old else None,
			}
		if metric in ("users", "enrollments", "certifications"):
			# Aggregate in SQL, converting native site datetimes to Brasília before grouping.
			same_zone = get_system_timezone() == str(REPORT_ZONE)
			day_expression = "date(creation)" if same_zone else "date(convert_tz(creation, %s, %s))"
			rows = frappe.db.sql(
				f"""select {day_expression} as date, count(*) as count
				from `tab{doctype}` where creation < %s {"and creation >= %s" if window["lower"] else ""}
				{"and enabled = 1 and name not in ('Administrator', 'Guest')" if metric == "users" else "and published = 1" if metric == "certifications" else ""}
				group by date order by date""",
				(
					*([] if same_zone else [get_system_timezone(), str(REPORT_ZONE)]),
					window["upper"],
					*([window["lower"]] if window["lower"] else []),
				),
				as_dict=True,
			)
			# No fallback to the wrong day if a MariaDB installation lacks zone tables.
			if any(row.date is None for row in rows):
				frappe.throw(_("O banco precisa das tabelas de fuso para agrupar os dias de Brasília."))
			series[metric] = rows
	return {
		"counts": counts,
		"comparison": comparison,
		"series": series,
		"completion_rate": counts["completions"] * 100 / counts["enrollments"]
		if counts["enrollments"]
		else None,
		"window": {key: window[key] for key in ("from_date", "to_date", "updated_at", "timezone")},
	}


def _records(metric, window, search="", sort="creation", direction="desc", start=0, page_length=20):
	doctype, filters, title = _population(metric, window)
	if sort not in ("name", "title", "creation") or direction not in ("asc", "desc"):
		frappe.throw(_("Ordenação inválida."))
	if not isinstance(search, str) or len(search) > 140:
		frappe.throw(_("Busca inválida."))
	if search.strip():
		pattern = "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
		or_filters = [[title, "like", pattern], ["name", "like", pattern]]
		if metric in ("enrollments", "completions", "certifications"):
			or_filters.append(["member", "like", pattern])
	else:
		or_filters = None
	field = title if sort == "title" else sort
	fields = ["name", f"{title} as title", "creation"]
	fields += (
		["username"]
		if metric == "users"
		else ["member", "course"]
		if metric in ("enrollments", "completions", "certifications")
		else []
	)
	if metric == "completions":
		rows, total = _completion_records(window, search, field, direction, start, page_length)
	else:
		rows = frappe.get_all(
			doctype,
			filters=filters,
			or_filters=or_filters,
			fields=fields,
			order_by=f"{field} {direction}, name {direction}",
			start=start,
			page_length=page_length,
		)
	if metric in ("enrollments", "completions", "certifications"):
		usernames = (
			dict(
				frappe.get_all(
					"User",
					filters={"name": ["in", [row.member for row in rows]]},
					fields=["name", "username"],
					as_list=True,
				)
			)
			if rows
			else {}
		)
		for row in rows:
			row.username = usernames.get(row.member)
	if metric != "completions":
		total = frappe.get_all(
			doctype, filters=filters, or_filters=or_filters, fields=[{"COUNT": "name", "as": "total"}], order_by=None
		)[0].total
	return rows, int(total)


@frappe.whitelist()
def get_statistics_records(
	metric,
	from_date=None,
	to_date=None,
	search="",
	sort="creation",
	direction="desc",
	start: int = 0,
	page_length: int = 20,
):
	_access()
	if isinstance(start, bool) or not isinstance(start, int) or start < 0 or page_length not in (20, 50, 100):
		frappe.throw(_("Página inválida."))
	window = report_window(from_date, to_date)
	rows, total = _records(metric, window, search, sort, direction, start, page_length)
	return {"rows": rows, "total": total}


@frappe.whitelist(methods=["GET"])
def export_statistics(
	metric, file_format="csv", from_date=None, to_date=None, search="", sort="creation", direction="desc"
):
	_access()
	if file_format not in ("csv", "xlsx", "pdf"):
		frappe.throw(_("Formato inválido."))
	window = report_window(from_date, to_date)
	rows, total = _records(metric, window, search, sort, direction, page_length=0)
	from lms.lms.analytics_report import send_analytics
	from lms.lms.dashboard.common import _analytics_report

	zone = ZoneInfo(get_system_timezone())
	data = [
		[
			row.name,
			row.title,
			row.creation.replace(tzinfo=zone).astimezone(REPORT_ZONE).strftime("%d/%m/%Y %H:%M"),
		]
		for row in rows
	]
	header = [_("Identificador"), _("Nome"), _("Cadastro em Brasília")]
	metric_title = {
		"courses": _("Cursos publicados"),
		"users": _("Cadastros habilitados"),
		"enrollments": _("Matrículas"),
		"completions": _("Matrículas concluídas"),
		"certifications": _("Certificados publicados"),
	}[metric]
	report = _analytics_report(
		window=(window["from_date"], window["to_date"]),
		enrolled=total,
		kpis=(),
		funnel=(),
		name=metric,
		title=metric_title,
		kind_label=_("Registros do indicador"),
		sheet_header=header,
		sheet_rows=data,
		table_header=header,
		table_rows=data,
		table_title=metric_title,
		empty_message=_("Nenhum registro neste indicador e período."),
	)
	report.note = _("Conjunto completo com os filtros e a ordenação selecionados. Corte em Brasília.")
	send_analytics(report, file_format)
