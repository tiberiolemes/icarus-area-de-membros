# Interações da aula no player

`src/pages/lesson-engagement.tsx` exporta as ações de favorito e anotação, as duas abas, os painéis do aluno e uma fila de moderação por aula. Os componentes usam as RPCs da aula pelo cliente Supabase existente.

## Integração na LessonPage

Na consulta principal, passe o ID confirmado pelo servidor somente após `data.can_access`. A consulta usa a mesma chave do botão de favorito. Use `summary.data?.comments_count` sem valor de fallback para renderizar a contagem quando o servidor responder. `notes_count` também está disponível no resumo.

```tsx
import {
  LessonComments,
  LessonEngagementActions,
  LessonEngagementTab,
  LessonNotes,
  useLessonEngagement,
} from "./lesson-engagement";

// Dentro de LessonPage, após a consulta de app_lesson.
const lessonId = data?.can_access ? data.lesson.id : undefined;
const summary = useLessonEngagement(lessonId);
const [notesFocus, setNotesFocus] = useState(0);
// Amplie o estado tab e o tratamento do tablist para:
// "description" | "materials" | "comments" | "notes".
```

No bloco autorizado, coloque `LessonEngagementActions` ao lado da conclusão. No atalho de anotação, selecione a aba e incremente o pedido de foco. Para o teclado do tablist, use as quatro abas em ordem e preserve as setas, Home e End.

```tsx
<LessonEngagementActions
  lessonId={lessonId}
  onOpenNotes={() => {
    setTab("notes");
    setNotesFocus((request) => request + 1);
  }}
/>

{/* Junto às abas existentes */}
<LessonEngagementTab
  tab="comments" active={tab === "comments"}
  id="comments-tab" panelId="lesson-comments"
  count={summary.error ? undefined : summary.data?.comments_count}
  onOpen={() => setTab("comments")}
/>
<LessonEngagementTab
  tab="notes" active={tab === "notes"}
  id="notes-tab" panelId="lesson-notes"
  onOpen={() => setTab("notes")}
/>

{/* Junto aos painéis existentes */}
<section id="lesson-comments" role="tabpanel" aria-labelledby="comments-tab"
  hidden={tab !== "comments"} tabIndex={0}>
  <LessonComments lessonId={lessonId} active={tab === "comments"} />
</section>
<section id="lesson-notes" role="tabpanel" aria-labelledby="notes-tab"
  hidden={tab !== "notes"} tabIndex={0}>
  <LessonNotes lessonId={lessonId} active={tab === "notes"}
    focusRequest={notesFocus}
    getPositionSeconds={hasMedia ? () => position.current : undefined}
    onSeek={seekWhenSupported}
  />
</section>
```

`authorName` em `LessonComments` é opcional e serve apenas para as iniciais, com ícone quando ausente. `getPositionSeconds` é chamado no envio de uma anotação nova, inclusive quando o valor é zero. Devolva `null` se o player não tiver posição conhecida. Passe `onSeek` apenas quando o player aceitar a busca. Na edição, a posição registrada é mantida. Em aulas de texto, omita os dois.

Mantenha os painéis montados com `hidden` e `active` para preservar textos ao alternar abas e adiar a consulta até a primeira abertura. Reinicie `notesFocus` na troca de aula, junto com a aba, e use a sessão autenticada existente. Os painéis limpam o estado local ao trocar o ID. Quando a sessão trocar de titular, remonte o bloco autenticado e limpe o cache da consulta conforme o fluxo de autenticação do app.

O formulário salva a anotação mediante ação explícita e confirma após o retorno da RPC. Em Comentários, o estado de moderação vem do servidor. Respostas reaparecem junto do comentário original quando ambos estão na mesma página. A contagem inclui os itens que o servidor permite ao aluno ver.

Na futura rota da equipe, renderize `<LessonCommentModeration lessonId={lessonId} />` dentro do acesso autenticado da equipe. O servidor decide o acesso ao modo de revisão e valida a decisão e o motivo. A ajuda da aula pode destacar o atalho de anotação, o retorno ao ponto salvo quando disponível e a aprovação humana antes de tornar o comentário visível aos demais alunos.
