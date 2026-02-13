import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import type { ComponentPropsWithoutRef } from "react"
import type { Components } from "react-markdown"

interface MarkdownRendererProps {
  children: string
  className?: string
  components?: Components
}

const defaultCodeRenderer = {
  code({
    inline,
    className,
    children,
    ...rest
  }: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
    const match = /language-(\w+)/.exec(className || "")
    const isInline = inline === true
    return !isInline && match ? (
      <SyntaxHighlighter
        style={oneDark}
        language={match[1]}
        PreTag="div"
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    ) : (
      <code className={className} {...rest}>
        {children}
      </code>
    )
  },
} satisfies Components

export function MarkdownRenderer({
  children,
  className = "",
  components,
}: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ ...defaultCodeRenderer, ...components }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
