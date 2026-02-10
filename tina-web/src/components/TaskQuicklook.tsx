import { Option } from "effect"
import type { TaskEvent } from "@/schemas"
import { optionText } from "@/lib/option-display"
import { formatBlockedByForDisplay } from "@/lib/task-dependencies"
import { QuicklookDialog } from "@/components/QuicklookDialog"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import styles from "./QuicklookDialog.module.scss"
import taskStyles from "./TaskQuicklook.module.scss"
import markdownStyles from "./PlanQuicklook.module.scss"

export interface TaskQuicklookProps {
  task: TaskEvent
  onClose: () => void
}

export function TaskQuicklook({ task, onClose }: TaskQuicklookProps) {
  const status = toStatusBadgeStatus(task.status)
  const blockedBy = Option.match(task.blockedBy, {
    onNone: () => null,
    onSome: (value) => formatBlockedByForDisplay(value) ?? null,
  })

  return (
    <QuicklookDialog title={task.subject} status={status} onClose={onClose}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Description</h3>
        {Option.match(task.description, {
          onNone: () => <div className={styles.value}>No description</div>,
          onSome: (description) => (
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
                {description}
              </ReactMarkdown>
            </div>
          ),
        })}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Details</h3>
        <div className={taskStyles.detailsGrid}>
          <div className={taskStyles.detailItem}>
            <span className={styles.label}>Owner:</span>
            <span className={styles.value}>
              {optionText(task.owner, (owner) => owner)}
            </span>
          </div>
          <div className={taskStyles.detailItem}>
            <span className={styles.label}>Phase:</span>
            <span className={styles.value}>
              {optionText(task.phaseNumber, (phase) => phase)}
            </span>
          </div>
          <div className={taskStyles.detailItem}>
            <span className={styles.label}>Recorded:</span>
            <span className={styles.value}>
              {new Date(task.recordedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </section>

      {blockedBy && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Blocked By</h3>
          <div className={styles.value}>{blockedBy}</div>
        </section>
      )}
    </QuicklookDialog>
  )
}
