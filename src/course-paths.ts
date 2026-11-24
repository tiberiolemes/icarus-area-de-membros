export function courseLessonPath(courseSlug: string, moduleSlug: string, lessonId: string) {
  return `/app/cursos/${encodeURIComponent(courseSlug)}/${encodeURIComponent(moduleSlug)}/~${encodeURIComponent(lessonId)}`;
}
