/**
 * Markdown renderer with syntax highlighting and XSS sanitization (T678).
 * Shared by StreamView and its sub-components.
 */
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : undefined
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value
      return `<pre class="hljs"><code class="${language ? `language-${language}` : ''}">${highlighted}</code></pre>`
    }
  }
})

/** Renders Markdown to sanitized HTML. DOMPurify prevents XSS from network content. */
export function renderMarkdown(text: string): string {
  const raw = marked.parse(text) as string
  return DOMPurify.sanitize(raw)
}
