<template>
	<section
		data-tour="first-result"
		v-if="!dismissed"
		class="my-6 max-w-prose space-y-3 text-p-base leading-7 text-ink-gray-9"
		:aria-label="__('Primeiros passos')"
	>
		<h2 class="text-xl font-semibold">
			{{
				creator
					? __('Crie sua primeira aula')
					: __('Comece pela sua primeira aula')
			}}
		</h2>
		<ol class="list-decimal space-y-2 ps-5">
			<template v-if="creator">
				<li>
					{{
						__(
							'Crie um curso, preencha os campos solicitados e salve o rascunho.'
						)
					}}
				</li>
				<li>
					{{
						__(
							'Adicione um capítulo e uma aula curta. Salve e confira a prévia antes de publicar.'
						)
					}}
				</li>
				<li>
					{{
						__(
							'O curso de demonstração é sintético. Use conteúdo próprio para seu curso real.'
						)
					}}
				</li>
			</template>
			<template v-else>
				<li>
					{{
						__('Abra Cursos e escolha um curso em que você está matriculado.')
					}}
				</li>
				<li>
					{{
						__(
							'Use Continuar ou abra a primeira aula disponível. Conclua a atividade e confira seu progresso.'
						)
					}}
				</li>
				<li>
					{{
						__(
							'Sem acesso ainda? Confira os cursos e turmas disponíveis com o responsável pela instalação.'
						)
					}}
				</li>
			</template>
		</ol>
		<div class="flex flex-wrap items-center gap-4">
			<Button
				:route="{ name: creator ? 'NewCourse' : 'Courses' }"
				variant="solid"
				>{{ creator ? __('Novo curso') : __('Ver cursos') }}</Button
			>
			<a
				:href="safeUrl(creator ? '/help#criador' : '/help#aluno')"
				v-external
				class="inline-flex min-h-11 items-center underline focus:focus-ring"
				>{{ __('Passo a passo (nova aba)') }}</a
			>
			<Button variant="ghost" @click="dismiss">{{ __('Agora não') }}</Button>
		</div>
	</section>
</template>
<script setup lang="ts">
import { vExternal } from '@/directives/external'
import { safeUrl } from '@/utils/safeUrl'
import { Button } from 'frappe-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ creator?: boolean; user: string }>()
const key = computed(
	() =>
		`icarus:first-result:${props.user}:${props.creator ? 'creator' : 'student'}`
)
const dismissed = ref(false)
watch(
	key,
	() => {
		try {
			dismissed.value = sessionStorage.getItem(key.value) === 'dismissed'
		} catch {
			dismissed.value = false
		}
	},
	{ immediate: true }
)
function dismiss() {
	dismissed.value = true
	try {
		sessionStorage.setItem(key.value, 'dismissed')
	} catch {
		/* In-memory dismissal still works. */
	}
}
</script>
