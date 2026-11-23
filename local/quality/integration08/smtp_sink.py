"""Loopback-only SMTP capture for explicitly listed synthetic QA recipients."""

import argparse
import email.policy
import json
import os
import re
import socketserver
import uuid
from email.parser import BytesParser
from pathlib import Path


class Sink(socketserver.StreamRequestHandler):
	def handle(self):
		self.connection.settimeout(15)
		recipients = []
		self.wfile.write(b"220 quality08.localhost synthetic capture\r\n")
		while raw := self.rfile.readline(8193):
			if len(raw) > 8192:
				return
			command, _, value = raw.decode("ascii", "replace").strip().partition(" ")
			command = command.upper()
			if command in ("EHLO", "HELO"):
				self.wfile.write(b"250-quality08.localhost\r\n250 SIZE 2097152\r\n")
			elif command == "MAIL":
				recipients = []
				self.wfile.write(b"250 OK\r\n")
			elif command == "RCPT":
				match = re.fullmatch(r"TO:\s*<([^<>\s]+)>", value, re.I)
				if match and match[1].lower() in self.server.allowed:
					recipients.append(match[1].lower())
					self.wfile.write(b"250 OK\r\n")
				else:
					self.wfile.write(b"550 Synthetic recipient allowlist only\r\n")
			elif command == "DATA" and recipients:
				self.wfile.write(b"354 End with a dot\r\n")
				body = bytearray()
				while line := self.rfile.readline(8193):
					if line == b".\r\n":
						break
					if len(line) > 8192 or len(body) + len(line) > 2097152:
						return
					body.extend(line[1:] if line.startswith(b"..") else line)
				else:
					return
				message = BytesParser(policy=email.policy.default).parsebytes(body)
				identity = uuid.uuid4().hex
				(self.server.output / (identity + ".eml")).write_bytes(body)
				(self.server.output / (identity + ".json")).write_text(
					json.dumps(
						{
							"recipients": recipients,
							"subject": str(message["Subject"] or ""),
							"bytes": len(body),
							"html_parts": sum(
								part.get_content_type() == "text/html" for part in message.walk()
							),
						}
					)
					+ "\n"
				)
				recipients = []
				self.wfile.write(b"250 Captured locally\r\n")
			elif command in ("RSET", "NOOP"):
				if command == "RSET":
					recipients = []
				self.wfile.write(b"250 OK\r\n")
			elif command == "QUIT":
				self.wfile.write(b"221 Bye\r\n")
				return
			else:
				self.wfile.write(b"503 Unsupported command or missing synthetic recipient\r\n")


def main():
	os.umask(0o077)
	parser = argparse.ArgumentParser()
	parser.add_argument("allowlist", type=Path)
	parser.add_argument("output", type=Path)
	parser.add_argument("--port", type=int, default=1026)
	args = parser.parse_args()
	allowed = set(json.loads(args.allowlist.read_text()))
	assert allowed and all(re.fullmatch(r"[a-z0-9._+-]+@example\.test", address) for address in allowed)
	args.output.mkdir(exist_ok=False, mode=0o700)
	with socketserver.ThreadingTCPServer(("127.0.0.1", args.port), Sink) as server:
		server.allowed = allowed
		server.output = args.output
		server.daemon_threads = True
		server.serve_forever(poll_interval=0.2)


if __name__ == "__main__":
	main()
