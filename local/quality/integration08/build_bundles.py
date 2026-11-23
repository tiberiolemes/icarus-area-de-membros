"""Run every native asset producer sequentially without retaining esbuild's parent heap."""

import json
import os
import shlex
import subprocess
from pathlib import Path
from importlib import import_module

import frappe

def main():
	bench = Path.cwd()
	assert (bench / "sites/apps.txt").is_file(), "Run from the bench root"
	os.chdir(bench / "sites")
	from frappe.bundler import (
		build_framework_islands,
		get_node_env,
		island_build_command,
		make_asset_dirs,
		setup,
	)
	from frappe.gettext.translate import compile_translations
	from frappe.utils.synchronization import filelock

	apps = ["frappe", "payments", "lms"]
	frappe.init("")
	env = dict(os.environ, **get_node_env())

	def invoke(method, *args):
		print(json.dumps({"native_build_hook": method}), flush=True)
		module, name = method.rsplit(".", 1)
		return getattr(import_module(module), name)(*args)

	def run(command, directory):
		print(json.dumps({"asset_producer": command, "cwd": str(directory)}), flush=True)
		subprocess.run(command, cwd=directory, env=env, check=True)

	try:
		with filelock("bench_build", is_global=True, timeout=10):
			setup()
			make_asset_dirs(hard_link=False)
			framework = Path(frappe.get_app_source_path("frappe"))
			# This CLI builds all core bundles; frontends run below after its heap is released.
			run(["node", "esbuild", "--production", "--apps", ",".join(apps)], framework)
			for app in apps:
				if app == "frappe":
					continue
				directory = Path(frappe.get_app_source_path(app))
				package = directory / "package.json"
				if package.exists() and json.loads(package.read_text()).get("scripts", {}).get("build"):
					run(["yarn", "build"], directory)
			for directory in (framework / "studio/frontend", framework / "flow"):
				run(["yarn", "install", "--frozen-lockfile"], directory)
				run(["yarn", "build"], directory)
			build_framework_islands(production=True)
			for app in apps:
				compile_translations(app, force=True)
			# Preserve the native hook order. Page islands are required here, so failure is fatal.
			for app in apps:
				for method in frappe.get_hooks("after_build", app_name=app):
					invoke(method)
			for app in frappe.get_all_apps():
				for method in frappe.get_hooks("after_app_build", app_name=app):
					if method == "frappe.bundler.build_page_islands":
						run(shlex.split(island_build_command("build-pages.js", production=True)), framework)
					else:
						invoke(method, apps)
			print(json.dumps({"all_native_bundle_producers_completed": True, "apps": apps}), flush=True)
	finally:
		frappe.destroy()

if __name__ == "__main__":
	main()
