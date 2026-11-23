"""Filter real instants before slicing, including classes authored in other zones."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from frappe.utils import get_system_timezone


def class_instant(row):
	zone = ZoneInfo(row.get("timezone") or get_system_timezone())
	day = datetime.strptime(str(row["date"]), "%Y-%m-%d")
	value = row["time"]
	if isinstance(value, timedelta):
		day += value
	else:
		parsed = datetime.strptime(str(value), "%H:%M:%S" if str(value).count(":") == 2 else "%H:%M")
		day = day.replace(hour=parsed.hour, minute=parsed.minute, second=parsed.second)
	return day.replace(tzinfo=zone)


def future_classes(rows, start=0, limit=4, *, now=None):
	now = now or datetime.now(ZoneInfo("UTC"))
	valid = []
	for row in rows:
		try:
			at = class_instant(row)
		except (ValueError, TypeError, KeyError):
			continue
		if at >= now:
			valid.append((at, row))
	valid.sort(key=lambda pair: (pair[0], pair[1]["name"]))
	return [row for _at, row in valid[max(0, start) : max(0, start) + limit]]
