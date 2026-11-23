"""A capture sink must refuse any recipient outside its synthetic allowlist."""

import json
import smtplib
import socketserver
import tempfile
import threading
import unittest
from email.message import EmailMessage
from pathlib import Path

from smtp_sink import Sink


class CaptureTests(unittest.TestCase):
	def test_positive_capture_and_external_recipient_denial(self):
		with (
			tempfile.TemporaryDirectory() as folder,
			socketserver.ThreadingTCPServer(("127.0.0.1", 0), Sink) as server,
		):
			server.allowed = {"qc08-capture@example.test"}
			server.output = Path(folder)
			thread = threading.Thread(target=server.serve_forever, daemon=True)
			thread.start()
			try:
				with smtplib.SMTP(*server.server_address, timeout=3) as smtp:
					message = EmailMessage()
					message["From"] = "qc08-sender@example.test"
					message["To"] = "qc08-capture@example.test"
					message["Subject"] = "Confirmação sintética"
					message.set_content("Texto de teste")
					message.add_alternative("<p>Confirmação sintética</p>", subtype="html")
					smtp.send_message(message)
					with self.assertRaises(smtplib.SMTPRecipientsRefused):
						smtp.sendmail(
							"qc08-sender@example.test", ["not-allowed@example.com"], message.as_bytes()
						)
				files = list(Path(folder).glob("*.json"))
				self.assertEqual(len(files), 1)
				proof = json.loads(files[0].read_text())
				self.assertEqual(proof["recipients"], ["qc08-capture@example.test"])
				self.assertEqual(proof["html_parts"], 1)
				self.assertEqual(proof["subject"], "Confirmação sintética")
			finally:
				server.shutdown()
				thread.join(timeout=3)


if __name__ == "__main__":
	unittest.main()
