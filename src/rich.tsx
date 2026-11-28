import { useEffect, useRef, useState } from "react";
import { useFormBusy } from "./ui";
import DOMPurify from "dompurify";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";

export const sanitizeRich = (content: string) =>
  DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "ul",
      "ol",
      "li",
      "h2",
      "h3",
      "blockquote",
      "a",
      "code",
      "pre",
    ],
    ALLOWED_ATTR: ["href", "title"],
    ALLOW_DATA_ATTR: false,
  });
export function RichContent({ content }: { content: string }) {
  return (
    <div
      className="prose"
      dangerouslySetInnerHTML={{ __html: sanitizeRich(content) }}
    />
  );
}
export function RichEditor({
  name = "description",
  initial = "",
  label = "Descrição",
}: {
  name?: string;
  initial?: string;
  label?: string;
}) {
  const [html, setHtml] = useState(initial),
    busy = useFormBusy();
  const input = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ["https", "http"],
        },
      }),
    ],
    content: sanitizeRich(initial),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
      transformPastedHTML: sanitizeRich,
    },
    onUpdate: ({ editor }) => {
      const content = editor.getHTML();
      setHtml(content);
      if (input.current) {
        input.current.value = content;
        input.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
  });
  useEffect(() => {
    editor?.setEditable(!busy, false);
  }, [editor, busy]);
  useEffect(() => {
    const field = input.current;
    if (!field || !editor) return;
    const restore = (event: Event) => {
      const content = sanitizeRich((event as CustomEvent<string>).detail);
      editor.commands.setContent(content, { emitUpdate: false });
      field.value = content;
      setHtml(content);
    };
    field.addEventListener("draftrestore", restore);
    return () => field.removeEventListener("draftrestore", restore);
  }, [editor]);
  return (
    <div className="rich-field">
      <span>{label}</span>
      <input ref={input} type="hidden" name={name} value={html} />
      <div
        className="rich-toolbar"
        role="toolbar"
        aria-label={`Formatar ${label.toLowerCase()}`}
      >
        <button
          type="button"
          aria-label="Negrito"
          aria-pressed={editor?.isActive("bold") ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          aria-label="Itálico"
          aria-pressed={editor?.isActive("italic") ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={18} />
        </button>
        <button
          type="button"
          aria-label="Lista"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={18} />
        </button>
        <button
          type="button"
          aria-label="Lista numerada"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={18} />
        </button>
        <button
          type="button"
          aria-label="Inserir link"
          onClick={() => {
            const href = window.prompt(
              "Endereço do link (https://)",
              editor?.getAttributes("link").href ?? "https://",
            );
            if (href === null) return;
            if (!href) {
              editor?.chain().focus().unsetLink().run();
              return;
            }
            try {
              const url = new URL(href);
              if (!["https:", "http:"].includes(url.protocol)) return;
              editor
                ?.chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url.href })
                .run();
            } catch {
              /* Invalid URL never enters the document. */
            }
          }}
        >
          <LinkIcon size={18} />
        </button>
        <button
          type="button"
          aria-label="Desfazer"
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo size={18} />
        </button>
        <button
          type="button"
          aria-label="Refazer"
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo size={18} />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
