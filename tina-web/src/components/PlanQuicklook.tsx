import { useId, useRef } from "react"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useQuicklookKeyboard } from "@/hooks/useQuicklookKeyboard"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { PlanQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import styles from "./QuicklookDialog.module.scss"
import markdownStyles from "./PlanQuicklook.module.scss"

interface PlanQuicklookProps {
  orchestrationId: string
  phaseNumber: string
  onClose: () => void
}

export function PlanQuicklook({ orchestrationId, phaseNumber, onClose }: PlanQuicklookProps) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  useQuicklookKeyboard(onClose)
  useFocusTrap(modalRef)

  const result = useTypedQuery(PlanQuery, {
    orchestrationId,
    phaseNumber,
  })

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Phase {phaseNumber} Plan
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close quicklook"
          >
            x
          </button>
        </div>
        <div className={styles.content}>
          {matchQueryResult(result, {
            loading: () => (
              <div className="text-muted-foreground">Loading plan...</div>
            ),
            error: () => (
              <div className="text-red-500">Failed to load plan</div>
            ),
            success: (plan) => {
              if (!plan) {
                return <div className="text-muted-foreground">No plan found</div>
              }

              return (
                <div className={markdownStyles.content}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code(props) {
                        const { className, children, ...rest } = props
                        const match = /language-(\w+)/.exec(className || "")
                        const isInline = !("inline" in rest) || rest.inline === false
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
                    }}
                  >
                    {plan.content}
                  </ReactMarkdown>
                </div>
              )
            },
          })}
        </div>
      </div>
    </div>
  )
}
