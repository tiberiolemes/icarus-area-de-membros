"""Report days are Brasília days; MariaDB datetimes retain the site's native zone."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import get_system_timezone

REPORT_ZONE = ZoneInfo("America/Sao_Paulo")


def report_window(from_date=None, to_date=None, *, now=None):
	now = now or datetime.now(REPORT_ZONE)
	now = now.astimezone(REPORT_ZONE)
	today = now.date()
	if from_date is None and to_date is None:
		start, end = today.replace(day=1), today
	elif from_date == "" and to_date == "":
		start, end = None, today
	else:
		try:
			start = datetime.strptime(from_date, "%Y-%m-%d").date() if from_date != "" else None
			end = datetime.strptime(to_date, "%Y-%m-%d").date() if to_date != "" else today
			if any(
				value and raw and value.strftime("%Y-%m-%d") != raw
				for value, raw in ((start, from_date), (end, to_date))
			):
				raise ValueError
		except (ValueError, TypeError):
			frappe.throw(_("Informe as duas datas completas e válidas."))
		if (start and start > end) or end > today:
			frappe.throw(_("O período deve estar em ordem e não incluir datas futuras."))
	zone = ZoneInfo(get_system_timezone())
	lower = (
		datetime.combine(start, time.min, REPORT_ZONE).astimezone(zone).replace(tzinfo=None)
		if start
		else None
	)
	upper = (
		min(datetime.combine(end + timedelta(days=1), time.min, REPORT_ZONE), now)
		.astimezone(zone)
		.replace(tzinfo=None)
	)
	return {
		"from_date": start.isoformat() if start else None,
		"to_date": end.isoformat(),
		"lower": lower,
		"upper": upper,
		"updated_at": now.isoformat(),
		"timezone": str(REPORT_ZONE),
	}


def within(filters, field, window):
	filters = list(filters)
	if window["lower"]:
		filters.append([field, ">=", window["lower"]])
	filters.append([field, "<", window["upper"]])
	return filters


def previous_window(window):
	if not window["from_date"]:
		return None
	start = datetime.fromisoformat(window["from_date"]).date()
	end = datetime.fromisoformat(window["to_date"]).date()
	length = (end - start).days + 1
	return report_window(
		(start - timedelta(days=length)).isoformat(),
		(start - timedelta(days=1)).isoformat(),
		now=datetime.fromisoformat(window["updated_at"]),
	)
