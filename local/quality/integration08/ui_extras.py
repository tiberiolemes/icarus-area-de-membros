"""Only synthetic documents, created through native controllers in the owned copy."""

import json, struct
from datetime import datetime, timedelta
from pathlib import Path
import frappe
from frappe.utils import add_days, nowdate, getdate
from frappe.utils.file_manager import save_file
from lms.lms.test_helpers import BaseTestUtils

frappe.init(site="tiberio.localhost", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
frappe.set_user("Administrator")
path = Path("tiberio.localhost/private/qc08-ui-fixtures.json")
fixture = json.loads(path.read_text())
assert frappe.conf.mute_emails and frappe.conf.pause_scheduler and not fixture.get("extended")
suffix = fixture["suffix"]
actors = fixture["actors"]
owned = fixture["owned_documents"]
before = len(owned)
config_path = Path("tiberio.localhost/site_config.json")
config_before = config_path.read_bytes()
config = json.loads(config_before)
fixture["ui_host_name_before"] = config.get("host_name")
config["host_name"] = "http://tiberio.localhost:8090"
try:
	config_path.write_text(json.dumps(config))
	config_path.chmod(0o600)
	for actor in actors.values():
		user = frappe.get_doc("User", actor["user"])
		user.language = "pt-BR"
		user.save()
	evaluator = BaseTestUtils._create_evaluator(actors["instructor"]["user"])
	evaluator.set(
		"schedule",
		[
			{"day": day, "start_time": start, "end_time": end}
			for day in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
			for start, end in (("09:00", "12:00"), ("13:00", "17:00"))
		],
	)
	evaluator.save()
	owned.append(["Course Evaluator", evaluator.name])
	batch = BaseTestUtils._create_batch(
		fixture["course"], actors["creator"]["user"], "QC08 UI Turma " + suffix, actors["instructor"]["user"]
	)
	batch.timezone = "America/Sao_Paulo"
	batch.save()
	BaseTestUtils._create_batch_enrollment(actors["student"]["user"], batch.name)
	owned.append(["LMS Batch", batch.name])
	fixture["batch"] = batch.name
	course = frappe.get_doc("LMS Course", fixture["course"])
	course.evaluator = evaluator.name
	course.save()
	frappe.set_user(actors["creator"]["user"])
	question = frappe.get_doc(
		{
			"doctype": "LMS Question",
			"question": "QC08 — Quanto é dois mais dois? " + suffix,
			"type": "Choices",
			"option_1": "Quatro",
			"is_correct_1": 1,
			"option_2": "Cinco",
			"is_correct_2": 0,
		}
	).insert()
	owned.append(["LMS Question", question.name])
	quiz = BaseTestUtils._create_quiz([question], "QC08 UI Avaliação " + suffix)
	quiz.max_attempts = 2
	quiz.save()
	owned.append(["LMS Quiz", quiz.name])
	fixture["quiz"] = quiz.name
	frappe.set_user("Administrator")
	lesson = frappe.get_doc("Course Lesson", fixture["second_lesson"])
	lesson.content = json.dumps(
		{
			"blocks": [
				{
					"type": "paragraph",
					"data": {"text": "Conteúdo sintético QC08: responda à avaliação após concluir o vídeo."},
				},
				{"type": "quiz", "data": {"quiz": quiz.name}},
			],
			"version": "2.29.0",
		},
		ensure_ascii=False,
	)
	lesson.save()
	frappe.set_user("Administrator")
	marker = ("QC08 synthetic " + suffix).encode()
	movie = (
		Path("/opt/local/assets/teste-tecnico.mp4").read_bytes()
		+ struct.pack(">I", 8 + len(marker))
		+ b"free"
		+ marker
	)
	video = save_file(
		"qc08-ui-video-" + suffix + ".mp4",
		movie,
		"Course Lesson",
		fixture["first_lesson"],
		is_private=1,
		df="content",
	)
	owned.append(["File", video.name])
	fixture["video_file"] = video.name
	lesson = frappe.get_doc("Course Lesson", fixture["first_lesson"])
	lesson.content = json.dumps(
		{
			"blocks": [
				{
					"type": "paragraph",
					"data": {
						"text": "Vídeo técnico sintético de oito segundos, sem conteúdo pedagógico real."
					},
				},
				{"type": "upload", "data": {"file_url": video.file_url, "file_type": "MP4"}},
			],
			"version": "2.29.0",
		},
		ensure_ascii=False,
	)
	lesson.save()
	# A whole synthetic future workday makes overlap/legibility observable without a provider.
	target = getdate(add_days(nowdate(), 2))
	while target.weekday() >= 5:
		target += timedelta(days=1)
	fixture["calendar_date"] = str(target)
	requests = []
	starts = [f"{hour:02}:{minute:02}:00" for hour in (9, 10, 11, 13, 14, 15) for minute in (0, 30)]
	for index, start in enumerate(starts):
		user = BaseTestUtils._create_user(
			f"qc08-ui-calendar-{index}-{suffix}@example.test",
			"QC08 Calendário",
			"Nome comprido " + str(index),
			["LMS Student"],
			"Website User",
		)
		owned.append(["User", user.name])
		BaseTestUtils._create_enrollment(user.name, fixture["course"])
		BaseTestUtils._create_batch_enrollment(user.name, batch.name)
		end = (datetime.strptime(start, "%H:%M:%S") + timedelta(minutes=30)).strftime("%H:%M:%S")
		request = frappe.get_doc(
			{
				"doctype": "LMS Certificate Request",
				"course": fixture["course"],
				"batch_name": batch.name,
				"member": user.name,
				"evaluator": evaluator.name,
				"date": str(target),
				"day": target.strftime("%A"),
				"start_time": start,
				"end_time": end,
				"timezone": "America/Sao_Paulo",
				"status": "Upcoming",
			}
		).insert()
		owned.append(["LMS Certificate Request", request.name])
		requests.append(request.name)
	fixture["calendar_requests"] = requests
	fixture["extended"] = True
	frappe.db.commit()
	path.write_text(json.dumps(fixture))
	path.chmod(0o600)
	print(
		json.dumps(
			{
				"synthetic_documents_added": len(owned) - before,
				"dense_calendar_requests": len(requests),
				"native_controllers": True,
				"original_site_touched": False,
				"external_integrations_used": False,
			}
		)
	)
except BaseException:
	config_path.write_bytes(config_before)
	fixture["extended_setup_failed"] = True
	path.write_text(json.dumps(fixture))
	path.chmod(0o600)
	raise
finally:
	frappe.db.rollback()
	frappe.destroy()
