"""Render own templates with explicit fixtures, without initializing a Frappe site."""

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

from jinja2 import DictLoader
from jinja2.sandbox import SandboxedEnvironment

ROOT = Path(__file__).resolve().parents[3]


class Row(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


def main():
	fake = ModuleType("frappe")
	fake._ = lambda text: text
	fake.form_dict = {}
	fake.db = Row(get_single_value=lambda doctype, field: "" if field == "custom_signup_content" else 0)
	spec = importlib.util.spec_from_file_location("help07", ROOT / "lms/www/help.py")
	help_module = importlib.util.module_from_spec(spec)
	with patch.dict(sys.modules, {"frappe": fake}):
		spec.loader.exec_module(help_module)
	templates = {
		"templates/web.html": "{% block page_content %}{% endblock %}{% block style %}{% endblock %}{% block script %}{% endblock %}"
	}
	for filename in ("help", "privacy", "terms", "your-data"):
		templates[filename] = (ROOT / "lms/www" / (filename + ".html")).read_text()
	templates["signup"] = (ROOT / "lms/templates/signup-form.html").read_text()
	env = SandboxedEnvironment(loader=DictLoader(templates))
	env.globals.update(_=fake._, frappe=fake, signup_context=lambda: {"ready": False})
	context = help_module.get_context(Row())
	assert len(context.articles) == 16
	assert len({article["id"] for article in context.articles}) == 16
	rendered = env.get_template("help").render(context)
	assert 'id="criador"' in rendered and 'id="privacidade"' in rendered
	assert "Este artigo ajudou?" in rendered
	fake.form_dict["q"] = '<script>alert("x")</script>'
	malicious = env.get_template("help").render(help_module.get_context(Row()))
	assert '<script>alert("x")</script>' not in malicious
	assert "&lt;script&gt;" in malicious
	assert "Nenhum artigo encontrado" in malicious
	fake.form_dict["q"] = "vigência"
	assert len(help_module.get_context(Row()).articles) >= 1
	for name in ("privacy", "terms", "your-data"):
		page = env.get_template(name).render(policy_ready=False, policy={}, policy_revision="")
		assert "preparação" in page
		assert "@example" not in page and "CNPJ" not in page
	signup = env.get_template("signup").render()
	assert 'id="signup-terms"' not in signup
	assert "awaiting" in signup and "/privacy" in signup
	# Parse the actual rendered JavaScript, including translated string literals.
	with tempfile.TemporaryDirectory() as directory:
		for name, source in (("help", rendered), ("signup", signup)):
			parts = source.split("<script>")[1:]
			for index, part in enumerate(parts):
				path = Path(directory) / f"{name}-{index}.js"
				path.write_text(part.split("</script>")[0])
				subprocess.run(["node", "--check", str(path)], check=True)
	print(
		json.dumps(
			{
				"templates_rendered": 5,
				"articles": 16,
				"query_escaping": True,
				"empty_search": True,
				"draft_pages": True,
				"rendered_javascript_parsed": True,
				"native_site_initialized": False,
			}
		)
	)


if __name__ == "__main__":
	main()
