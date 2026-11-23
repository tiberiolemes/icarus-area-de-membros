"""Purpose-specific uploads, with originals private and authoritative byte validation."""

import io
import secrets
from contextvars import ContextVar
from pathlib import PurePath

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint
from PIL import Image, ImageOps, UnidentifiedImageError

from lms.lms.permissions import (
	can_author_batch,
	can_author_course,
	is_site_administrator,
	resolve_lesson_course,
)
from lms.lms.utils import has_course_instructor_role

MIB = 1024 * 1024
LIMITS = {
	"avatar": 10 * MIB,
	"cover": 20 * MIB,
	"brand": 20 * MIB,
	"material": 25 * MIB,
	"video": 2 * 1024 * MIB,
	"intro_video": 2 * 1024 * MIB,
}
IMAGE_LIMITS = {"avatar": 250 * 1024, "cover": 500 * 1024, "brand": 500 * 1024, "material": 500 * 1024}
_internal_original = ContextVar("lms_media_original", default=False)
_validated_upload_limit = ContextVar("lms_media_upload_limit", default=None)


def inspect_bytes(content, filename, purpose):
	if (
		purpose not in LIMITS
		or not isinstance(content, bytes)
		or not content
		or len(content) > LIMITS[purpose]
	):
		frappe.throw(_("Arquivo vazio, finalidade inválida ou tamanho acima do limite informado."))
	ext = PurePath(filename).suffix.lower()
	if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
		try:
			with Image.open(io.BytesIO(content)) as image:
				if image.width * image.height > 40_000_000:
					frappe.throw(_("A imagem excede 40 milhões de pixels."))
				if image.format not in ("PNG", "JPEG", "WEBP", "GIF"):
					raise ValueError
				actual = {"PNG": {".png"}, "JPEG": {".jpg", ".jpeg"}, "WEBP": {".webp"}, "GIF": {".gif"}}[
					image.format
				]
				if ext not in actual:
					raise ValueError
				image.verify()
		except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
			frappe.throw(_("O conteúdo não corresponde a uma imagem válida."))
		if purpose in ("video", "intro_video"):
			frappe.throw(_("Envie um vídeo, não uma imagem."))
		return "image"
	if purpose in ("avatar", "cover", "brand"):
		frappe.throw(_("Envie uma imagem PNG, JPEG, WebP ou GIF válida."))
	if ext in (".mp4", ".mov") and len(content) >= 12 and content[4:8] == b"ftyp":
		return "video"
	if ext == ".webm" and content.startswith(b"\x1aE\xdf\xa3"):
		return "video"
	if purpose in ("video", "intro_video"):
		frappe.throw(_("Envie um vídeo MP4, MOV ou WebM válido."))
	if ext == ".pdf" and content.startswith(b"%PDF-"):
		return "PDF"
	if ext == ".txt" and purpose == "material":
		try:
			text = content.decode("utf-8")
			if "\x00" in text:
				raise ValueError
		except (UnicodeError, ValueError):
			frappe.throw(_("Tipo de arquivo não permitido ou conteúdo incompatível com a extensão."))
		return "text"
	if (
		(
			ext == ".mp3"
			and (content.startswith(b"ID3") or content[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"))
		)
		or (ext == ".wav" and content.startswith(b"RIFF") and content[8:12] == b"WAVE")
		or (ext == ".ogg" and content.startswith(b"OggS"))
		or (
			ext in (".m4a", ".aac") and (content[4:8] == b"ftyp" or content[:2] in (b"\xff\xf1", b"\xff\xf9"))
		)
		or (ext == ".flac" and content.startswith(b"fLaC"))
	):
		return "audio"
	frappe.throw(_("Tipo de arquivo não permitido ou conteúdo incompatível com a extensão."))


def optimized_image(content, purpose, crop):
	if crop not in ("contain", "square", "landscape") or (purpose == "brand" and crop != "contain"):
		frappe.throw(_("Recorte inválido. A marca deve ser preservada inteira."))
	with Image.open(io.BytesIO(content)) as image:
		image = ImageOps.exif_transpose(image).convert("RGBA")
		bounds = (512, 512) if purpose == "avatar" else (1600, 1000)
		if crop != "contain":
			bounds = (512, 512) if crop == "square" else (1500, 844)
			image = ImageOps.fit(image, bounds, method=Image.Resampling.LANCZOS)
		else:
			image.thumbnail(bounds, Image.Resampling.LANCZOS)
			if purpose == "avatar":
				# The complete photo fits even inside consumers that mask avatars as circles.
				image.thumbnail((360, 360), Image.Resampling.LANCZOS)
				canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
				canvas.alpha_composite(image, ((512 - image.width) // 2, (512 - image.height) // 2))
				image = canvas
		for quality in (85, 75, 60, 45):
			output = io.BytesIO()
			image.save(output, format="WEBP", quality=quality)
			if output.tell() <= IMAGE_LIMITS[purpose]:
				return output.getvalue()
	frappe.throw(_("A imagem processada ainda excede o limite. Escolha uma imagem menor."))


def _authorize(purpose, doctype, docname):
	if frappe.session.user == "Guest":
		frappe.throw(_("Entre na sua conta para enviar arquivos."), frappe.PermissionError)
	if purpose == "avatar":
		if doctype != "User" or docname != frappe.session.user:
			frappe.throw(_("Você só pode alterar a própria foto."), frappe.PermissionError)
	elif purpose == "brand":
		if not is_site_administrator():
			frappe.throw(_("Sem permissão para alterar a marca."), frappe.PermissionError)
	elif doctype == "Course Lesson" and docname:
		course = resolve_lesson_course(docname)
		if not course or not can_author_course(course):
			frappe.throw(_("Sem permissão para enviar arquivos nesta aula."), frappe.PermissionError)
	elif doctype == "LMS Course" and docname:
		if not can_author_course(docname):
			frappe.throw(_("Sem permissão para enviar arquivos neste curso."), frappe.PermissionError)
	elif doctype == "LMS Batch" and docname:
		if not can_author_batch(docname):
			frappe.throw(_("Sem permissão para enviar arquivos nesta turma."), frappe.PermissionError)
	elif (
		not doctype
		and not docname
		and (
			purpose == "cover"
			and frappe.has_permission("File", "create")
			or has_course_instructor_role()
			or is_site_administrator()
		)
	):
		# A draft has no destination yet; lesson media remain private and owned by the uploader.
		return
	else:
		frappe.throw(_("Informe um destino permitido para o arquivo."), frappe.PermissionError)


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=3600)
def upload(purpose, crop="contain", doctype=None, docname=None, fieldname=None, is_private: int = 1):
	if purpose not in LIMITS:
		frappe.throw(_("Finalidade de arquivo inválida."))
	if purpose == "avatar" and not doctype and not docname:
		doctype, docname, fieldname = "User", frappe.session.user, "user_image"
	_authorize(purpose, doctype, docname)
	if "file" not in frappe.request.files:
		frappe.throw(_("Escolha um arquivo."))
	file = frappe.request.files["file"]
	content = file.stream.read(LIMITS[purpose] + 1)
	name = PurePath(file.filename.replace("\\", "/")).name
	kind = inspect_bytes(content, name, purpose)
	# A lesson chooses video by its bytes, so its 2GB policy does not inherit an image limit.
	private = purpose in ("material", "video") or doctype == "Course Lesson" or bool(cint(is_private))
	if kind == "image":
		processed = optimized_image(content, purpose, crop)
		original_token = _internal_original.set(True)
		try:
			original = _save_file(
				"original-" + secrets.token_hex(8) + PurePath(name).suffix,
				content,
				None,
				None,
				is_private=1,
				limit=LIMITS[purpose],
			)
		finally:
			_internal_original.reset(original_token)
		content = processed
		name = "image-" + secrets.token_hex(12) + ".webp"
	file_doc = _save_file(
		name, content, doctype, docname, is_private=int(private), df=fieldname, limit=LIMITS[purpose]
	)
	return {
		"file_url": file_doc.file_url,
		"file_type": "WEBP" if kind == "image" else PurePath(name).suffix[1:].upper(),
		"original_url": original.file_url if kind == "image" else None,
	}


def validate_native_file(doc, method=None):
	"""File.validate integration hook; source alone does not activate this boundary."""
	if _internal_original.get():
		return
	doctype, field = doc.attached_to_doctype, doc.attached_to_field
	purpose = (
		"avatar"
		if doctype == "User" and field == "user_image"
		else "cover"
		if doctype in ("LMS Course", "LMS Batch") and field == "image"
		else "material"
		if doctype == "Course Lesson"
		else None
	)
	if not purpose:
		return
	content = doc.get_content()
	if isinstance(content, str):
		content = content.encode("utf-8")
	kind = inspect_bytes(
		content,
		doc.file_name,
		"video"
		if PurePath(doc.file_name).suffix.lower() in (".mp4", ".mov", ".webm") and purpose == "material"
		else purpose,
	)
	if purpose == "material" and not doc.is_private:
		frappe.throw(_("Mídia de aula deve permanecer privada."))
	if kind == "image" and len(content) > IMAGE_LIMITS[purpose]:
		frappe.throw(_("Use o envio de imagem para otimizar e preservar o original antes de salvar."))


def _save_file(name, content, doctype, docname, *, is_private, limit, df=None):
	# File's own lifecycle keeps hashing, storage hooks, deduplication and rollback cleanup.
	marker = _validated_upload_limit.set(limit)
	try:
		return frappe.get_doc(
			{
				"doctype": "File",
				"file_name": name,
				"content": content,
				"is_private": is_private,
				"attached_to_doctype": doctype,
				"attached_to_name": docname,
				"attached_to_field": df,
			}
		).insert(ignore_permissions=True)
	finally:
		_validated_upload_limit.reset(marker)


class MediaFilePolicyMixin:
	"""Merge into extend_doctype_class, alongside the lesson-download extension from01."""

	def check_max_file_size(self):
		content = self._content
		if content is None:
			content = self.get_content()
		if isinstance(content, str):
			content = content.encode("utf-8")
		limit = _validated_upload_limit.get()
		if limit is None and self.attached_to_doctype == "Course Lesson":
			purpose = (
				"video"
				if PurePath(self.file_name).suffix.lower() in (".mp4", ".mov", ".webm")
				else "material"
			)
			inspect_bytes(content, self.file_name, purpose)
			limit = LIMITS[purpose]
		if limit is None:
			return super().check_max_file_size()
		if len(content) > limit:
			frappe.throw(_("O arquivo excede o limite da finalidade selecionada."))
		return len(content)


def _validate_image_reference(url, purpose, *, owner=None):
	if isinstance(url, str) and url.startswith("/assets/lms/") and ".." not in url and "\\" not in url:
		# Bundled artwork is shipped source, not an unvalidated user upload.
		return
	if not isinstance(url, str) or not url.startswith(("/files/", "/private/files/")):
		frappe.throw(_("Envie a imagem pelo controle de arquivo para validar o conteúdo e o tamanho."))
	rows = frappe.get_all("File", filters={"file_url": url}, fields=["name", "owner"])
	if not rows or owner and not is_site_administrator() and not any(row.owner == owner for row in rows):
		frappe.throw(_("Escolha uma imagem enviada por você."), frappe.PermissionError)
	file = frappe.get_doc("File", rows[0].name)
	content = file.get_content()
	if isinstance(content, str):
		content = content.encode("utf-8")
	if inspect_bytes(content, file.file_name, purpose) != "image" or len(content) > IMAGE_LIMITS[purpose]:
		frappe.throw(_("Use o envio de imagem para aplicar o limite da finalidade selecionada."))


def validate_user_avatar(doc, method=None):
	# Do not rewrite provider images or old records when unrelated account fields change.
	if not doc.is_new() and doc.has_value_changed("user_image") and doc.user_image:
		_validate_image_reference(doc.user_image, "avatar", owner=doc.name)


def validate_course_cover(doc, method=None):
	if doc.image and (doc.is_new() or doc.has_value_changed("image")):
		_validate_image_reference(doc.image, "cover")
