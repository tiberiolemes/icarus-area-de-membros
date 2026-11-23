import { getCachedResource } from 'frappe-ui'
import { reloadResource } from '@/utils/resource'

export function reloadExistingCourseOutlines(
	course: string,
	current?: { reload: () => unknown }
) {
	const snapshots = new Set([
		current,
		getCachedResource(['course_outline', course]),
		getCachedResource(['course_outline_student', course, 'progress']),
		getCachedResource(['course_outline_student', course, 'no-progress']),
	])
	return Promise.all(
		[...snapshots]
			.filter((resource) => resource != null)
			.map((resource) => reloadResource(resource))
	)
}
