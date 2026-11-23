import { afterEach, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import { translate } from '@/translationMessages'

afterEach(() => { delete (window as any).lang })
function list(file: string): any {
 const filename = path.resolve(import.meta.dirname, '../pages', file)
 return baseParse(parse(fs.readFileSync(filename,'utf8')).descriptor.template!.content).children.find((node: any) => node.tag === 'ListPage')
}
function render(source: string, bindings: Record<string, any>) {
 ;(window as any).lang = 'pt-BR'
 const fn = new Function('Vue', compile(source, { mode: 'function' }).code)(Vue)
 const before = JSON.stringify(bindings)
 const wrapper = mount({ setup: () => bindings, render: fn }, { global: { mocks: { __: translate } } })
 const text = wrapper.text()
 expect(JSON.stringify(bindings)).toBe(before)
 wrapper.unmount()
 return text
}
function title(file: string, bindings: Record<string, any>) {
 const node = list(file)
 let expression = node.props.find((p: any) => p.type === 7 && p.arg?.content === 'title')?.exp.content
 if (!expression) {
  const slot = node.children.find((n: any) => n.props?.some((p: any) => p.name === 'slot' && p.arg?.content === 'name'))
  expression = slot.children.find((n: any) => n.type === 5).content.content
 }
 return render('<output>{{ '+expression+' }}</output>', bindings)
}
it.each([
 ['Assignments.vue','totalAssignments','atividade','atividades'],
 ['Quizzes.vue','totalCount','questionário','questionários'],
 ['ProgrammingExercises/ProgrammingExercises.vue','totalExercises','exercício','exercícios'],
].flatMap(([file,key,singular,plural]) => [0,1,2].map(count => ({file,key,count,expected:`${count} ${count===1?singular:plural}`}))))('localizes $file count $count', ({file,key,count,expected}) => {
 expect(title(file, { [key]: key === 'totalCount' ? count : { data: count } })).toBe(expected)
})
it.each(['Open','Closed'].flatMap(status => [0,1,2].map(count => ({status,count,expected:`${count} ${count===1?'vaga':'vagas'} ${status==='Open'?(count===1?'aberta':'abertas'):(count===1?'fechada':'fechadas')}`}))))('localizes vacancy state $status and count $count without changing the state ID', ({status,count,expected}) => {
 expect(title('Jobs.vue',{ activeTab:status, jobCount:{data:count} })).toBe(expected)
})
it.each([['Text','Texto'],['Image','Imagem'],['PDF','PDF']])('localizes the assignment type %s through the real cell slot', (value, expected) => {
 const slot = list('Assignments.vue').children.find((n: any) => n.props?.some((p: any) => p.name === 'slot' && p.arg?.content === 'cell'))
 expect(render(slot.children.map((n: any) => n.loc.source).join(''), { column:{key:'type'},value })).toBe(expected)
})
it('preserves an authored title that happens to match a type ID', () => {
 const slot = list('Assignments.vue').children.find((n: any) => n.props?.some((p: any) => p.name === 'slot' && p.arg?.content === 'cell'))
 expect(render(slot.children.map((n: any) => n.loc.source).join(''), { column:{key:'title'},value:'Text' })).toBe('Text')
})
