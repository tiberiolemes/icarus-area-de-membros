"""Confirm an existing browser session; never read or enter a password in the UI."""

import argparse
import json

from browser_matrix import call

USERS = {
	"admin": "Administrator",
	"student": "i18nqa-student@example.test",
	"creator": "i18nqa-creator@example.test",
	"instructor": "i18nqa-instructor@example.test",
}


def login(persona):
	"""Keep the historical caller contract, but require a pre-authorized session."""
	expected = USERS[persona]
	# Same-origin GET reads the native session identity; no auth tokens or cookie exports.
	expression = r"""(async () => {
      if (location.origin !== 'http://tiberio.localhost:8088') return {wrongOrigin:true};
      const response = await fetch('/api/method/frappe.auth.get_logged_user', {credentials:'same-origin'});
      if (!response.ok) return {authenticated:false};
      const data = await response.json();
      return {authenticated:data.message !== 'Guest', user:data.message};
    })()"""
	state = json.loads(call("eval", "--expression", expression)["result"])
	if not state.get("authenticated") or state.get("user") != expected:
		raise SystemExit(
			"A sessão disponível não corresponde ao perfil solicitado. "
			"Solicite login humano no navegador homologado ou personificação nativa "
			"autorizada da conta de demonstração e execute novamente; nenhuma senha foi lida."
		)
	call("goto", "--url", "http://tiberio.localhost:8088/lms")
	call("viewport", "--width", "1440", "--height", "1000")
	call("wait", "--load", "networkidle", "--timeout", "12000")
	print(json.dumps({"persona": persona, "existing_session_verified": True, "password_entered": False}))


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("persona", choices=list(USERS))
	login(parser.parse_args().persona)
