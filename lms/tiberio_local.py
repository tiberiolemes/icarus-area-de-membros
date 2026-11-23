"""Synthetic local fixtures and native settings; never enable on production sites."""
import json
from pathlib import Path

import frappe

from lms.lms.api import create_lesson, upsert_chapter

COURSE = "desenvolvimento-com-agentes-de-ia-estudo-inicial"


def seed():
    assert frappe.local.site == "tiberio.localhost", "Local site only"
    secrets = json.loads(Path("/run/tiberio/secrets.json").read_text())
    frappe.set_user("Administrator")
    for source, translated in json.loads(Path("/opt/local/translations.json").read_text()).items():
        existing = frappe.db.exists("Translation", {"language": "pt-BR", "source_text": source})
        if not existing:
            frappe.get_doc({"doctype": "Translation", "language": "pt-BR",
                            "source_text": source, "translated_text": translated}).insert()
    if not frappe.is_setup_complete():
        from frappe.desk.page.setup_wizard.setup_wizard import setup_complete
        from lms.lms.api import clear_demo_data

        language = frappe.db.get_value("Language", "pt-BR", "language_name")
        result = setup_complete({"language": language, "country": "Brazil", "currency": "BRL",
                                 "timezone": "America/Sao_Paulo", "enable_telemetry": 0})
        assert result.get("status") == "ok", "Native setup did not complete"
        clear_demo_data()
        frappe.db.commit()
    if frappe.db.exists("LMS Course", COURSE):
        from lms.lms.doctype.lms_course.lms_course import update_course_statistics
        update_course_statistics()
        frappe.db.commit()
        frappe.clear_cache()
        print("Local fixtures already exist; no content or progress overwritten.")
        return
    system = frappe.get_single("System Settings")
    system.update({"language": "pt-BR", "time_zone": "America/Sao_Paulo", "country": "Brazil",
                   "setup_complete": 1, "enable_telemetry": 0})
    system.save()
    settings = frappe.get_single("LMS Settings")
    settings.update({"allow_guest_access": 0, "disable_signup": 1, "persona_captured": 1,
                     "default_currency": "BRL", "send_notification_for_published_courses": "",
                     "send_notification_for_published_batches": "", "disable_pwa": 1,
                     "show_discussions": 1, "show_dashboard": 1})
    settings.save()
    website = frappe.get_single("Website Settings")
    website.update({"app_name": "Tibério Lemes", "home_page": "lms", "disable_signup": 1,
                    "website_title": "Tibério Lemes — área de membros"})
    for email, key, name in [("aluno@example.test", "student", "Aluno de teste"),
                              ("outro@example.test", "other", "Outro aluno de teste")]:
        if not frappe.db.exists("User", email):
            frappe.get_doc({"doctype": "User", "email": email, "first_name": name,
                            "language": "pt-BR", "send_welcome_email": 0, "new_password": secrets[key],
                            "user_type": "Website User", "roles": [{"role": "LMS Student"}]}).insert()
    admin = frappe.get_doc("User", "Administrator")
    admin.language = "pt-BR"
    admin.add_roles("Moderator", "Course Creator")
    admin.save()
    from frappe.utils.file_manager import save_file

    logo = save_file("assinatura-tiberio.svg", Path("/opt/local/assets/assinatura-tiberio.svg").read_bytes(),
                     "Website Settings", "Website Settings", is_private=0)
    website.app_logo = logo.file_url
    website.banner_image = logo.file_url
    website.save()
    course = frappe.get_doc({"doctype": "LMS Course", "title": "Desenvolvimento com agentes de IA — estudo inicial",
                            "short_introduction": "Conteúdo provisório de estudo. As aulas gravadas serão adicionadas por Tibério.",
                            "description": "<p>Área local de avaliação da plataforma Tibério Lemes. Material inicial baseado na edição pública do padrão de desenvolvimento.</p><p>Vídeo técnico de teste, sem gravações, depoimentos ou alunos reais.</p>",
                            "instructors": [{"instructor": "Administrator"}], "published": 1,
                            "status": "Approved", "enforce_lesson_completion": 1,
                            "disable_self_learning": 1}).insert()
    assert course.name == COURSE, course.name
    for title, lessons in [
        ("Comece por aqui", [
            ("Boas-vindas e material de estudo", [
                paragraph("Este é um curso inicial provisório para avaliar a área de membros. Não representa a grade final do Método Tibério."),
                paragraph('Leia a <a href="https://tiberiolemes.com.br/estudo-padrao-dev-metodo-tiberio/" target="_blank" rel="noopener">edição pública do padrão de desenvolvimento</a>.'),
                paragraph("Trabalhe com escopo claro, preserve o comportamento necessário e valide o resultado no uso real.")]),
            ("Vídeo técnico de teste — não é uma aula de Tibério", [
                paragraph("Clipe técnico gerado localmente com FFmpeg: padrão de cores e tom de áudio, duração de 8 segundos. Usado somente para verificar upload, salvamento e reprodução no player nativo."),
                {"type": "upload", "data": {"file_url": "VIDEO_PLACEHOLDER", "file_type": "MP4"}}])]),
        ("Prática de estudo", [
            ("Planeje uma alteração pequena", [paragraph("Escolha uma necessidade real. Descreva o que a pessoa precisa fazer, quem pode fazê-lo e o resultado observável. Antes de alterar, leia o fluxo e seus consumidores.")]),
            ("Verifique e registre o resultado", [paragraph("Exercite o caminho feliz, erros de entrada e tentativas sem permissão. Registre o que foi verificado, o que falta e os limites reais. Discuta dúvidas no tópico da aula.")])])]:
        chapter = upsert_chapter(title=title, course=course.name)
        # The native method returns the chapter document.
        chapter_name = chapter.name if hasattr(chapter, "name") else chapter["name"]
        for lesson_title, blocks in lessons:
            lesson = create_lesson(chapter_name, lesson_title, {"blocks": [b for b in blocks if b.get("data", {}).get("file_url") != "VIDEO_PLACEHOLDER"], "version": "2.29.0"})
            if lesson_title == "Boas-vindas e material de estudo":
                material = save_file("roteiro-de-estudo.txt", Path("/opt/local/assets/roteiro-de-estudo.txt").read_bytes(),
                                     "Course Lesson", lesson, is_private=1, df="content")
                blocks.append(paragraph(f'<a href="{material.file_url}" target="_blank" rel="noopener">Baixar roteiro inicial de estudo (TXT)</a>'))
                doc = frappe.get_doc("Course Lesson", lesson)
                doc.content = json.dumps({"blocks": blocks, "version": "2.29.0"}, ensure_ascii=False)
                doc.save()
            if any(b.get("data", {}).get("file_url") == "VIDEO_PLACEHOLDER" for b in blocks):
                video = save_file("teste-tecnico.mp4", Path("/opt/local/assets/teste-tecnico.mp4").read_bytes(),
                                  "Course Lesson", lesson, is_private=1, df="content")
                for block in blocks:
                    if block.get("data", {}).get("file_url") == "VIDEO_PLACEHOLDER":
                        block["data"]["file_url"] = video.file_url
                doc = frappe.get_doc("Course Lesson", lesson)
                doc.content = json.dumps({"blocks": blocks, "version": "2.29.0"}, ensure_ascii=False)
                doc.save()
    frappe.get_doc({"doctype": "LMS Enrollment", "course": course.name,
                    "member": "aluno@example.test", "member_type": "Student"}).insert()
    draft = frappe.get_doc({"doctype": "LMS Course", "title": "Rascunho privado de validação",
                           "short_introduction": "Fixture privada para testar permissões.",
                           "description": "<p>Conteúdo sintético restrito.</p>",
                           "instructors": [{"instructor": "Administrator"}], "published": 0}).insert()
    chapter = upsert_chapter(title="Restrito", course=draft.name)
    chapter_name = chapter.name if hasattr(chapter, "name") else chapter["name"]
    create_lesson(chapter_name, "Aula não liberada", {"blocks": [paragraph("MARCADOR_PRIVADO_LOCAL_62941")]})
    from lms.lms.doctype.lms_course.lms_course import update_course_statistics
    update_course_statistics()
    frappe.db.commit()
    frappe.clear_cache()
    print("Native local course, users, enrollment and private video created.")


def paragraph(text):
    return {"type": "paragraph", "data": {"text": text}}
