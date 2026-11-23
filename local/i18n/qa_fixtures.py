"""Temporary native documents for locale UAT; never changes original study data."""
import io
import json
import sys
import zipfile
from pathlib import Path

import frappe
from frappe.utils import add_days, today

frappe.init(site="tiberio.localhost")
frappe.connect()
frappe.set_user("Administrator")
frappe.flags.mute_emails = True
assert frappe.local.site == "tiberio.localhost"
PREFIX = "Homologação local de idioma — temporário"
ledger = []
ids = {}


def insert(doctype, key=None, **values):
    doc = frappe.get_doc({"doctype": doctype, **values}).insert()
    ledger.append([doctype, doc.name])
    if key:
        ids[key] = doc.name
    return doc


def create():
    from lms.lms.api import create_lesson, upsert_chapter
    from frappe.utils.file_manager import save_file
    from weasyprint import HTML

    assert frappe.conf.mute_emails, "Email delivery must be disabled for UAT"
    assert not frappe.db.exists("Email Account", {"enable_outgoing": 1})
    access = json.loads(Path("/tmp/i18nqa-access.json").read_text())
    assert not frappe.db.exists("User", "i18nqa-student@example.test"), "QA fixtures already exist"
    for key, name, roles in [
        ("student", "Pessoa estudante temporária", ["LMS Student"]),
        ("creator", "Pessoa criadora temporária", ["Course Creator"]),
        ("instructor", "Pessoa instrutora temporária", ["Course Creator", "Batch Evaluator"]),
    ]:
        insert("User", key, email=f"i18nqa-{key}@example.test", first_name=name,
               username=f"i18nqa-{key}", language="en", send_welcome_email=0,
               new_password=access[key], roles=[{"role": r} for r in roles],
               user_type="Website User")
    course = insert("LMS Course", "course", title=PREFIX,
                    short_introduction="Dados sintéticos para verificar textos e controles. Serão removidos.",
                    description="<p>Curso temporário sem aulas reais ou métricas de alunos.</p>",
                    instructors=[{"instructor": ids["creator"]}, {"instructor": ids["instructor"]}],
                    published=1, status="Approved", enforce_lesson_completion=0,
                    disable_self_learning=1, image="/assets/lms/images/assinatura-tiberio.svg")
    chapter = upsert_chapter(title="Conteúdo sintético de homologação", course=course.name)
    ids["chapter"] = chapter.name
    ledger.append(["Course Chapter", chapter.name])
    authors = [{"author": ids["creator"]}, {"author": ids["instructor"]}]
    question = insert("LMS Question", "question", question="<p>Qual opção descreve esta homologação?</p>",
                      type="Choices", marks=1, option_1="Verificação local", is_correct_1=1,
                      option_2="Curso definitivo", authors=authors)
    quiz = insert("LMS Quiz", "quiz", title=PREFIX+" — questionário", passing_percentage=50,
                  total_marks=1, questions=[{"question": question.name, "marks": 1}], authors=authors,
                  show_answers=1, show_submission_history=1)
    assignment = insert("LMS Assignment", "assignment", title=PREFIX+" — atividade", type="Text",
                        question="<p>Descreva uma verificação de idioma.</p>", authors=authors)
    exercise = insert("LMS Programming Exercise", "exercise", title=PREFIX+" — exercício",
                      problem_statement="<p>Retorne o número recebido.</p>", language="Python",
                      starter_code="def solve(value):\n    return value", test_cases=[{"input": "1", "expected_output": "1"}],
                      authors=authors)
    lesson = create_lesson(chapter.name, "Vídeo, PDF e material — teste temporário", {"blocks": []})
    ids["lesson"] = lesson
    ledger.append(["Course Lesson", lesson])
    def file(name, content, private=1):
        result = save_file(name, content, "Course Lesson", lesson, is_private=private, df="content")
        ledger.append(["File", result.name])
        return result
    video = file("i18nqa-video.mp4", Path("/tmp/i18nqa-video.mp4").read_bytes())
    pdf = file("i18nqa-material.pdf", HTML(string='<html lang="pt-BR"><body><h1>Material sintético de homologação</h1><p>Verificação local de leitura e controles do PDF.</p></body></html>').write_pdf())
    material = file("i18nqa-roteiro.txt", "Material temporário de teste de idioma.".encode())
    blocks = [
        {"type": "paragraph", "data": {"text": "Vídeo técnico de teste gerado localmente. Não é uma aula de Tibério."}},
        {"type": "upload", "data": {"file_url": video.file_url, "file_type": "MP4"}},
        {"type": "upload", "data": {"file_url": pdf.file_url, "file_type": "PDF"}},
        {"type": "paragraph", "data": {"text": f'<a href="{material.file_url}">Baixar material temporário</a>'}},
    ]
    doc = frappe.get_doc("Course Lesson", lesson)
    doc.content = json.dumps({"blocks": blocks, "version": "2.29.0"}, ensure_ascii=False)
    doc.save()
    for key, kind in [("quiz", "quiz"), ("assignment", "assignment"), ("exercise", "program")]:
        content = {"blocks": [{"type": kind, "data": {key: ids[key], "name": ids[key]}}], "version": "2.29.0"}
        created = create_lesson(chapter.name, "Avaliação temporária — "+key, content)
        ids[key+"Lesson"] = created
        ledger.append(["Course Lesson", created])
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("imsmanifest.xml", '<?xml version="1.0"?><manifest identifier="i18nqa" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><organizations default="org"><organization identifier="org"><title>Pacote sintético</title><item identifier="item" identifierref="res"><title>Leitura de teste</title></item></organization></organizations><resources><resource identifier="res" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources></manifest>')
        archive.writestr("index.html", '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><h1>Pacote sintético de homologação</h1><p>Conteúdo de teste local.</p></html>')
    package = file("i18nqa-scorm.zip", payload.getvalue())
    scorm = upsert_chapter(title="Pacote de teste temporário", course=course.name,
                           is_scorm_package=True, scorm_package={"name": package.name})
    ids["scorm"] = scorm.name
    ledger.append(["Course Chapter", scorm.name])
    insert("LMS Enrollment", "enrollment", course=course.name, member=ids["student"], member_type="Student")
    batch = insert("LMS Batch", "batch", title=PREFIX+" — turma", start_date=add_days(today(), 7),
                   end_date=add_days(today(), 14), start_time="14:00:00", end_time="15:00:00",
                   timezone="America/Sao_Paulo", description="Turma sintética temporária.",
                   batch_details="<p>Teste local sem reunião externa.</p>", published=1,
                   instructors=[{"instructor": ids["instructor"]}], courses=[{"course": course.name}],
                   medium="Online", show_live_class=1)
    insert("LMS Batch Enrollment", "batchEnrollment", batch=batch.name, member=ids["student"])
    insert("LMS Program", "program", title=PREFIX+" — trilha", published=1, authors=authors,
           program_courses=[{"course": course.name}], program_members=[{"member": ids["student"]}])
    insert("Course Evaluator", "evaluator", evaluator=ids["instructor"], schedule=[
        {"day": day, "start_time": "14:00:00", "end_time": "15:00:00"}
        for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]])
    insert("LMS Assignment Submission", "assignmentSubmission", owner=ids["student"], assignment=assignment.name,
           member=ids["student"], status="Not Graded", type="Text", answer="<p>Resposta sintética.</p>")
    insert("LMS Quiz Submission", "quizSubmission", owner=ids["student"], quiz=quiz.name, member=ids["student"],
           score=1, score_out_of=1, percentage=100, passing_percentage=50,
           result=[{"question_name": question.name, "question": question.question, "question_type": "Choices",
                    "answer": "Verificação local", "is_correct": 1, "marks": 1, "marks_out_of": 1}])
    insert("LMS Programming Exercise Submission", "exerciseSubmission", owner=ids["student"], exercise=exercise.name,
           member=ids["student"], status="Passed", code="def solve(value):\n    return value")
    insert("Job Opportunity", "job", job_title=PREFIX+" — vaga", location="Local de teste", type="Contract",
           status="Open", description="<p>Vaga fictícia apenas para homologação. Não se candidate.</p>",
           company_name="Organização sintética", company_website="http://tiberio.localhost:8088",
           company_logo="/assets/lms/images/assinatura-tiberio.svg", country="Brazil",
           company_email_address="i18nqa@example.test", work_mode="Remote")
    insert("Data Import", "import", reference_doctype="LMS Enrollment", import_type="Insert New Records")
    # No outgoing account exists; native certificate notification therefore cannot send.
    assert not frappe.db.exists("Email Account", {"enable_outgoing": 1})
    template = frappe.db.get_value("Print Format", {"doc_type": "LMS Certificate"}, "name")
    if template:
        insert("LMS Certificate", "certificate", issue_date=today(), course=course.name,
               member=ids["student"], template=template, published=1)
    # Fixture writers run as Administrator; native owner-only permissions must
    # still reflect the actor who would have authored these temporary records.
    authored = {"LMS Course", "Course Chapter", "Course Lesson", "LMS Quiz", "LMS Question",
                "LMS Assignment", "LMS Programming Exercise", "LMS Program", "Job Opportunity", "File"}
    student_work = {"LMS Quiz Submission", "LMS Assignment Submission", "LMS Programming Exercise Submission"}
    for doctype, name in ledger:
        owner = (ids["creator"] if doctype in authored else ids["student"] if doctype in student_work
                 else ids["instructor"] if doctype in {"Course Evaluator", "LMS Batch"} else None)
        if owner:
            frappe.db.set_value(doctype, name, "owner", owner)
    frappe.db.commit()
    print(json.dumps({"ids": ids, "ledger": ledger}, ensure_ascii=False))


try:
    create()
except Exception:
    frappe.db.rollback()
    raise
finally:
    frappe.destroy()
