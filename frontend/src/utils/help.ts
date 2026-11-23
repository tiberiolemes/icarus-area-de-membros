export function helpArticle(routeName: unknown): string {
	const name = String(routeName || '')
	if (/Community/.test(name)) return 'comunidade'
	if (/Discussion/.test(name)) return 'moderacao'
	if (/Profile|Setup|Login/.test(name)) return 'sessao'
	if (/LessonForm/.test(name)) return 'arquivos'
	if (/CourseForm|CourseEditor|NewCourse|ChapterForm/.test(name))
		return 'criador'
	if (/CoursePublish/.test(name)) return 'arquivo'
	if (/Course|Lesson|Batch|Home/.test(name)) return 'aluno'
	return 'recuperacao'
}
