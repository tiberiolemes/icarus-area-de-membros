import fs from 'node:fs'
import { routes } from '../../../frontend/src/routes.js'

const data = JSON.parse(fs.readFileSync('lms/public/tours/quality07.json'))
const actual = []
function walk(list, parent = '') {
 for (const route of list) {
  const path = route.path.startsWith('/') ? route.path : `${parent}/${route.path}`
  if (route.name) actual.push({ name: route.name, path, source: String(route.component || '').match(/import\(['"]([^'"]+)/)?.[1] || null })
  if (route.children) walk(route.children, path)
 }
}
walk(routes)
const missing = actual.filter(route => !data.pages[route.name] && !data.exclusions[route.name])
if (actual.length !== 64 || new Set(actual.map(route => route.name)).size !== 64 || missing.length) throw Error(JSON.stringify(missing))
const map = {
 revision: data.revision,
 source: 'frontend/src/routes.js + lms/public/tours/quality07.json',
 named_routes: actual.length,
 tours: Object.keys(data.tours).length,
 pages_and_states: Object.keys(data.pages).length,
 routes: actual.map(route => ({ ...route, ...(data.pages[route.name] ? { ...data.pages[route.name], article: `/help#${data.pages[route.name].article}`, source_status: 'implemented_source', runtime_status: 'pending08' } : { tour: null, reason: data.exclusions[route.name], runtime_status: 'check08_exclusion' }) })),
 page_states: Object.entries(data.pages).map(([page, definition]) => ({ page, ...definition, article: `/help#${definition.article}`, targets: data.tours[definition.tour].map(step => step.target), runtime_status: 'pending08' })),
 states_without_separate_tour: data.states_without_separate_tour,
 state_policy: data.state_policy,
 missing,
}
fs.writeFileSync('docs/audit/quality/evidence/07-tour-route-map.json', JSON.stringify(map, null, 2) + '\n')
console.log(JSON.stringify({ named_routes: map.named_routes, tours: map.tours, pages_and_states: map.pages_and_states, exclusions: Object.keys(data.exclusions).length, missing: map.missing }))
