"""Synthetic native report rendering; QA fixture/site only, never a product write."""
import copy
import hashlib
import json
import sys
from pathlib import Path

import frappe

out = Path(sys.argv[1])
assert out.parent == Path('/tmp') and out.name.startswith('qc08-pdf-') and not out.exists()
out.mkdir(mode=0o700)
frappe.init(site='tiberio.localhost', sites_path='/home/frappe/frappe-bench/sites')
frappe.connect()
try:
	assert frappe.conf.mute_emails and frappe.conf.pause_scheduler
	book = json.loads(Path(frappe.get_site_path('private', 'qc08-ui-fixtures.json')).read_text())
	frappe.set_user(book['actors']['admin']['user'])
	from lms.lms.analytics_report import report_html, report_pdf
	from lms.lms.dashboard.course import _course_analytics
	from lms.lms.dashboard.batch import _batch_analytics, _batch_dashboard_context

	if len(sys.argv) == 3:
		# Development reduction only. The final artifact uses its shipped template unchanged.
		template = Path(sys.argv[2])
		assert template.parent == Path('/tmp') and template.name.startswith('qc08-')
		source = template.read_text()
		native_render = frappe.render_template
		def render(path, context=None, *args, **kwargs):
			return native_render(source if path == 'lms/templates/analytics_report.html' else path, context, *args, **kwargs)
		frappe.render_template = render

	course = _course_analytics(book['course'], (None, None))
	assert len(course.table_rows) == 14
	batch = copy.deepcopy(course)
	batch.kind_label = 'Análise sintética da turma'
	batch.title = 'QC08 Turma çã — relatório sintético'
	batch.table_header = ['Nome', 'E-mail', 'Progresso', 'Cursos', 'Aulas', 'Avaliação', 'Situação', 'Última atividade']
	batch.table_rows = [[f'QC08 Pessoa sintética de nome comprido {i:02d}', f'qc08-endereco-longo-{i:02d}-sem-destinatario-externo@example.test', '50,00%', '1/2', '1/2', 'Agendado', 'Em andamento', f'22/11/2026 15:00 FIM{i:02d}'] for i in range(14)]
	batch.classes = [frappe._dict(title='QC08 Aula sintética longa çã',date='22/11/2026',percent=100,attended=14)]
	native_batch = _batch_analytics(_batch_dashboard_context(book['batch']), (None, None))
	assert native_batch.table_rows
	metadata = {}
	for name, report in [('course', course), ('batch', native_batch), ('batch_stress', batch)]:
		(out / (name + '.pdf')).write_bytes(report_pdf(report))
		(out / (name + '.html')).write_text(report_html(report))
		metadata[name] = {'headers': report.table_header, 'rows': report.table_rows, 'funnel': [f"{r['count']} ({r['percent']:.2f}%)".replace('.', ',') for r in report.funnel if r['percent'] is not None], 'brand': frappe.get_cached_value('Website Settings',None,'app_name')}
	metadata['fixture_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
	(out / 'expected-private.json').write_text(json.dumps(metadata, ensure_ascii=False))
	print(json.dumps({'cases':3, 'course_rows':14, 'batch_stress_rows':14, 'development_template_override':len(sys.argv)==3}))
finally:
	frappe.db.rollback()
	frappe.destroy()
