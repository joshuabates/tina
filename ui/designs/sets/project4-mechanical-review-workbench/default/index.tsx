import { useMemo, useRef, useState, type WheelEvent } from "react";
import {
  agentRuns,
  reviewCommits,
  reviewContext,
  reviewFiles,
  reviewThreadsSeed,
  type ReviewFile,
} from "./data";

type ReviewTab = "conversation" | "changes" | "commits" | "checks";

type DraftComment = {
  id: string;
  scope: "line" | "general";
  filePath: string;
  side?: "old" | "new";
  line?: number;
  body: string;
  author: string;
  createdAgo: string;
};

type FileTreeNode = {
  kind: "dir" | "file";
  name: string;
  path: string;
  children: FileTreeNode[];
  file?: ReviewFile;
};

const tabs: Array<{ id: ReviewTab; label: string }> = [
  { id: "conversation", label: "Conversation" },
  { id: "changes", label: "Changes" },
  { id: "commits", label: "Commits" },
  { id: "checks", label: "Checks" },
];

const SPRING_THRESHOLD = 170;

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function checkTone(status: "ingesting" | "ready" | "failed"): string {
  if (status === "ready") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800";
  }
  if (status === "failed") {
    return "border-rose-300 bg-rose-100 text-rose-800";
  }
  return "border-amber-300 bg-amber-100 text-amber-800";
}

function splitTone(kind: "context" | "added" | "removed" | "modified") {
  return {
    old: kind === "removed" || kind === "modified" ? "bg-rose-50" : "bg-slate-50",
    next: kind === "added" || kind === "modified" ? "bg-emerald-50" : "bg-slate-50",
  };
}

function prettyScope(comment: DraftComment): string {
  if (comment.scope === "general") {
    return `${comment.filePath} | general`;
  }

  return `${comment.filePath} | ${comment.side ?? "new"} L${comment.line ?? "?"}`;
}

function initials(author: string): string {
  const parts = author
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function buildFileTree(files: ReviewFile[]): FileTreeNode[] {
  const roots: FileTreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let nodes = roots;
    let currentPath = "";

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index] ?? "";
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let nextNode = nodes.find((node) => node.path === currentPath);

      if (!nextNode) {
        nextNode = {
          kind: isFile ? "file" : "dir",
          name: part,
          path: currentPath,
          children: [],
          file: isFile ? file : undefined,
        };
        nodes.push(nextNode);
      }

      nodes = nextNode.children;
    }
  }

  const sortNodes = (nodesToSort: FileTreeNode[]) => {
    nodesToSort.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "dir" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    for (const node of nodesToSort) {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(roots);
  return roots;
}

function listDirectoryPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];

  const walk = (items: FileTreeNode[]) => {
    for (const item of items) {
      if (item.kind === "dir") {
        paths.push(item.path);
        walk(item.children);
      }
    }
  };

  walk(nodes);
  return paths;
}

function filterTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return nodes;
  }

  const keep: FileTreeNode[] = [];

  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.path.toLowerCase().includes(normalized)) {
        keep.push(node);
      }
      continue;
    }

    const children = filterTree(node.children, normalized);
    const dirMatch =
      node.path.toLowerCase().includes(normalized) || node.name.toLowerCase().includes(normalized);

    if (dirMatch || children.length > 0) {
      keep.push({
        ...node,
        children,
      });
    }
  }

  return keep;
}

const fullFileTree = buildFileTree(reviewFiles);
const defaultExpandedDirs = Object.fromEntries(listDirectoryPaths(fullFileTree).map((path) => [path, true]));

export default function DesignSetScreen() {
  const [activeTab, setActiveTab] = useState<ReviewTab>("changes");
  const [selectedFilePath, setSelectedFilePath] = useState<string>(reviewFiles[0]?.path ?? "");
  const [fileFilter, setFileFilter] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>(defaultExpandedDirs);
  const [lineCommentTarget, setLineCommentTarget] = useState<{
    filePath: string;
    side: "old" | "new";
    line: number;
  } | null>(null);
  const [lineCommentBody, setLineCommentBody] = useState("");
  const [conversationBody, setConversationBody] = useState("");
  const [conversationComposerExpanded, setConversationComposerExpanded] = useState(false);
  const [draftComments, setDraftComments] = useState<DraftComment[]>([]);
  const [spring, setSpring] = useState<{ direction: "next" | "prev" | null; progress: number }>({
    direction: null,
    progress: 0,
  });
  const diffScrollRef = useRef<HTMLDivElement | null>(null);

  const filteredFiles = useMemo(() => {
    const normalized = fileFilter.trim().toLowerCase();
    if (normalized.length === 0) {
      return reviewFiles;
    }

    return reviewFiles.filter((file) => file.path.toLowerCase().includes(normalized));
  }, [fileFilter]);

  const filesForNavigation = filteredFiles.length > 0 ? filteredFiles : reviewFiles;

  const selectedFile = useMemo(() => {
    return filesForNavigation.find((file) => file.path === selectedFilePath) ?? filesForNavigation[0] ?? null;
  }, [filesForNavigation, selectedFilePath]);

  const selectedFileIndex = useMemo(() => {
    if (!selectedFile) {
      return -1;
    }

    return filesForNavigation.findIndex((file) => file.path === selectedFile.path);
  }, [filesForNavigation, selectedFile]);

  const previousFile = selectedFileIndex > 0 ? filesForNavigation[selectedFileIndex - 1] : null;
  const nextFile =
    selectedFileIndex >= 0 && selectedFileIndex < filesForNavigation.length - 1
      ? filesForNavigation[selectedFileIndex + 1]
      : null;

  const activeLineTarget =
    lineCommentTarget && lineCommentTarget.filePath === selectedFile?.path ? lineCommentTarget : null;

  const filteredTree = useMemo(() => {
    return filterTree(fullFileTree, fileFilter);
  }, [fileFilter]);

  const fileThreads = useMemo(() => {
    if (!selectedFile) {
      return [];
    }

    return reviewThreadsSeed.filter((thread) => thread.filePath === selectedFile.path);
  }, [selectedFile]);

  const selectedFileDrafts = useMemo(() => {
    if (!selectedFile) {
      return [];
    }

    return draftComments.filter((comment) => comment.filePath === selectedFile.path);
  }, [draftComments, selectedFile]);

  const tabCounts = useMemo(() => {
    return {
      conversation: reviewThreadsSeed.length + draftComments.length,
      changes: reviewFiles.length,
      commits: reviewCommits.length,
      checks: agentRuns.length,
    };
  }, [draftComments.length]);

  const toggleDirectory = (path: string) => {
    setExpandedDirs((current) => ({
      ...current,
      [path]: !current[path],
    }));
  };

  const jumpToFile = (path: string) => {
    setSelectedFilePath(path);
    setLineCommentTarget(null);
    setLineCommentBody("");
    setSpring({ direction: null, progress: 0 });

    requestAnimationFrame(() => {
      const viewport = diffScrollRef.current;
      if (!viewport) {
        return;
      }
      viewport.scrollTop = 0;
    });
  };

  const jumpAdjacent = (direction: "next" | "prev"): boolean => {
    if (selectedFileIndex < 0) {
      return false;
    }

    const targetIndex = direction === "next" ? selectedFileIndex + 1 : selectedFileIndex - 1;
    const target = filesForNavigation[targetIndex];
    if (!target) {
      return false;
    }

    setSelectedFilePath(target.path);
    setLineCommentTarget(null);
    setLineCommentBody("");

    requestAnimationFrame(() => {
      const viewport = diffScrollRef.current;
      if (!viewport) {
        return;
      }
      viewport.scrollTop = direction === "next" ? 0 : viewport.scrollHeight;
    });

    return true;
  };

  const handleDiffWheel = (event: WheelEvent<HTMLDivElement>) => {
    const viewport = diffScrollRef.current;
    if (!viewport) {
      return;
    }

    const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2;
    const atTop = viewport.scrollTop <= 2;

    if (event.deltaY === 0) {
      return;
    }

    const direction: "next" | "prev" = event.deltaY > 0 ? "next" : "prev";
    const overscrolling = (direction === "next" && atBottom) || (direction === "prev" && atTop);

    if (!overscrolling) {
      if (spring.direction !== null) {
        setSpring({ direction: null, progress: 0 });
      }
      return;
    }

    event.preventDefault();

    const baseProgress = spring.direction === direction ? spring.progress : 0;
    const progress = Math.min(SPRING_THRESHOLD, baseProgress + Math.abs(event.deltaY));

    if (progress >= SPRING_THRESHOLD) {
      const moved = jumpAdjacent(direction);
      setSpring(
        moved
          ? { direction: null, progress: 0 }
          : {
              direction,
              progress: SPRING_THRESHOLD,
            },
      );
      return;
    }

    setSpring({ direction, progress });
  };

  const openLineComment = (file: ReviewFile, side: "old" | "new", line: number | null) => {
    if (line === null) {
      return;
    }

    setLineCommentTarget({
      filePath: file.path,
      side,
      line,
    });
    setLineCommentBody("");
  };

  const addLineComment = () => {
    const body = lineCommentBody.trim();
    if (!activeLineTarget || body.length === 0) {
      return;
    }

    setDraftComments((current) => [
      {
        id: `line-${current.length + 1}`,
        scope: "line",
        filePath: activeLineTarget.filePath,
        side: activeLineTarget.side,
        line: activeLineTarget.line,
        body,
        author: reviewContext.reviewOwner,
        createdAgo: "just now",
      },
      ...current,
    ]);

    setLineCommentBody("");
    setLineCommentTarget(null);
  };

  const addConversationComment = () => {
    const body = conversationBody.trim();
    if (body.length === 0) {
      return;
    }

    setDraftComments((current) => [
      {
        id: `conversation-${current.length + 1}`,
        scope: "general",
        filePath: "PR conversation",
        body,
        author: reviewContext.reviewOwner,
        createdAgo: "just now",
      },
      ...current,
    ]);

    setConversationBody("");
    setConversationComposerExpanded(false);
  };

  const renderTreeNodes = (nodes: FileTreeNode[], depth: number) => {
    return (
      <ul className="space-y-0.5">
        {nodes.map((node) => {
          const paddingLeft = 10 + depth * 18;

          if (node.kind === "dir") {
            const expanded = fileFilter.trim().length > 0 ? true : (expandedDirs[node.path] ?? false);

            return (
              <li key={node.path}>
                <button
                  type="button"
                  onClick={() => toggleDirectory(node.path)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
                  style={{ paddingLeft }}
                >
                  <span className="w-4 text-xs text-slate-500">{expanded ? "v" : ">"}</span>
                  <span className="truncate">{node.name}</span>
                </button>
                {expanded && node.children.length > 0 ? renderTreeNodes(node.children, depth + 1) : null}
              </li>
            );
          }

          const file = node.file;
          if (!file) {
            return null;
          }

          const selected = selectedFile?.path === file.path;
          const marker = file.status === "added" ? "+" : file.status === "deleted" ? "-" : "~";

          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => jumpToFile(file.path)}
                className={cx(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition",
                  selected
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white",
                )}
                style={{ paddingLeft }}
              >
                <span className="w-4 text-xs text-slate-500">{marker}</span>
                <span className="truncate">{node.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold text-slate-900">{reviewContext.prLabel}</h2>
        <p className="text-sm text-slate-600">
          {reviewContext.orchestrationId} | {reviewContext.branch} | reviewer {reviewContext.reviewOwner}
        </p>
      </header>

      <nav className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 text-white">
        <ul className="flex min-w-max">
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            const count = tabCounts[tab.id];

            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cx(
                    "flex items-center gap-3 border-r border-slate-800 px-6 py-4 text-lg transition",
                    selected ? "bg-slate-900 text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white",
                  )}
                >
                  <span>{tab.label}</span>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-base text-slate-200">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {activeTab === "conversation" ? (
        <section className="space-y-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add comment</p>
            {!conversationComposerExpanded ? (
              <input
                value={conversationBody}
                onFocus={() => setConversationComposerExpanded(true)}
                onChange={(event) => setConversationBody(event.target.value)}
                placeholder="Write a comment"
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              />
            ) : (
              <>
                <textarea
                  value={conversationBody}
                  onChange={(event) => setConversationBody(event.target.value)}
                  placeholder="Write a comment"
                  className="mt-2 h-28 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-500"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={addConversationComment}
                    disabled={conversationBody.trim().length === 0}
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Comment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConversationBody("");
                      setConversationComposerExpanded(false);
                    }}
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Conversation</p>
            <ul className="mt-3 space-y-3">
              {draftComments.map((comment) => (
                <li key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                      {initials(comment.author)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900">{comment.author}</span>
                        <span className="text-slate-500">commented {comment.createdAgo}</span>
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                          draft
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{prettyScope(comment)}</p>
                      <p className="mt-2 text-sm text-slate-800">{comment.body}</p>
                    </div>
                  </div>
                </li>
              ))}

              {reviewThreadsSeed.map((thread) => (
                <li key={thread.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                      {initials(thread.author)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900">{thread.author}</span>
                        <span className="text-slate-500">commented {thread.updatedAgo}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {thread.filePath}:{thread.line}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{thread.summary}</p>
                      <p className="mt-1 text-sm text-slate-700">{thread.body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

      {activeTab === "changes" ? (
        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-100">
            <div className="mb-3">
              <input
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value)}
                placeholder="Filter files..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-slate-500"
              />
            </div>
            <div className="max-h-[68vh] overflow-y-auto pr-1">{renderTreeNodes(filteredTree, 0)}</div>
          </aside>

          <section className="space-y-3">
            <article className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current file</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{selectedFile?.path ?? "No file selected"}</p>
                  <p className="text-xs text-slate-500">
                    {selectedFile ? `+${selectedFile.additions} / -${selectedFile.deletions}` : "No matching files"}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{previousFile ? `Prev: ${previousFile.path.split("/").slice(-1)[0]}` : "At first file"}</p>
                  <p>{nextFile ? `Next: ${nextFile.path.split("/").slice(-1)[0]}` : "At last file"}</p>
                </div>
              </div>
            </article>

            <div
              ref={diffScrollRef}
              onWheel={handleDiffWheel}
              className="max-h-[68vh] overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-white"
            >
              <table className="min-w-full border-collapse font-mono text-[12px] leading-5 text-slate-800">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-8 px-1 py-2 text-center font-semibold">+</th>
                    <th className="w-14 px-1 py-2 text-right font-semibold">Old</th>
                    <th className="px-2 py-2 text-left font-semibold">Before</th>
                    <th className="w-8 border-l border-slate-200 px-1 py-2 text-center font-semibold">+</th>
                    <th className="w-14 px-1 py-2 text-right font-semibold">New</th>
                    <th className="px-2 py-2 text-left font-semibold">After</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedFile?.diffRows ?? []).map((row) => {
                    const tone = splitTone(row.kind);
                    return (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className={cx("px-1 py-1 text-center", tone.old)}>
                          <button
                            type="button"
                            disabled={row.oldLine === null || !selectedFile}
                            onClick={() => selectedFile && openLineComment(selectedFile, "old", row.oldLine)}
                            className={cx(
                              "h-5 w-5 rounded border text-[11px] font-semibold",
                              row.oldLine === null
                                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                                : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
                            )}
                          >
                            +
                          </button>
                        </td>
                        <td className={cx("px-1 py-1 text-right text-slate-500", tone.old)}>{row.oldLine ?? ""}</td>
                        <td className={cx("whitespace-pre-wrap break-words px-2 py-1", tone.old)}>{row.oldText || " "}</td>
                        <td className={cx("border-l border-slate-200 px-1 py-1 text-center", tone.next)}>
                          <button
                            type="button"
                            disabled={row.newLine === null || !selectedFile}
                            onClick={() => selectedFile && openLineComment(selectedFile, "new", row.newLine)}
                            className={cx(
                              "h-5 w-5 rounded border text-[11px] font-semibold",
                              row.newLine === null
                                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                                : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
                            )}
                          >
                            +
                          </button>
                        </td>
                        <td className={cx("px-1 py-1 text-right text-slate-500", tone.next)}>{row.newLine ?? ""}</td>
                        <td className={cx("whitespace-pre-wrap break-words px-2 py-1", tone.next)}>{row.newText || " "}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {spring.direction ? (
              <article className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Spring navigation</p>
                <p className="mt-1 text-sm text-slate-700">
                  {spring.direction === "next"
                    ? nextFile
                      ? `Keep scrolling down to jump to ${nextFile.path}`
                      : "No next file to jump to"
                    : previousFile
                      ? `Keep scrolling up to jump to ${previousFile.path}`
                      : "No previous file to jump to"}
                </p>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-slate-700 transition-all"
                    style={{ width: `${(spring.progress / SPRING_THRESHOLD) * 100}%` }}
                  />
                </div>
              </article>
            ) : null}

            <article className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add line comment</p>
              <p className="mt-1 text-[11px] text-slate-600">
                {activeLineTarget
                  ? `Target: ${activeLineTarget.side} line ${activeLineTarget.line}`
                  : "Click + next to any line in the diff to comment."}
              </p>
              <textarea
                value={lineCommentBody}
                onChange={(event) => setLineCommentBody(event.target.value)}
                disabled={!activeLineTarget}
                placeholder="Write an inline comment"
                className="mt-2 h-24 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none transition focus:border-slate-500 disabled:bg-slate-100"
              />
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={addLineComment}
                  disabled={!activeLineTarget || lineCommentBody.trim().length === 0}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add line comment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLineCommentTarget(null);
                    setLineCommentBody("");
                  }}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Comments for this file</p>
              {selectedFileDrafts.length === 0 && fileThreads.length === 0 ? (
                <p className="mt-2 text-xs text-slate-600">No comments yet for this file.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selectedFileDrafts.map((comment) => (
                    <li key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="text-[11px] text-slate-500">
                        {comment.author} | {comment.createdAgo} | {prettyScope(comment)}
                      </p>
                      <p className="mt-1 text-xs text-slate-800">{comment.body}</p>
                    </li>
                  ))}
                  {fileThreads.map((thread) => (
                    <li key={thread.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="text-[11px] text-slate-500">
                        {thread.author} | {thread.updatedAgo} | {thread.filePath}:{thread.line}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-900">{thread.summary}</p>
                      <p className="mt-1 text-xs text-slate-700">{thread.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </section>
      ) : null}

      {activeTab === "commits" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <ul className="space-y-2">
            {reviewCommits.map((commit) => (
              <li key={commit.sha} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {commit.sha} | {commit.title}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {commit.author} | {commit.timeAgo} | {commit.filesChanged} files changed
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeTab === "checks" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <ul className="space-y-2">
            {agentRuns.map((run) => (
              <li key={run.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {run.id} | {run.model}
                  </p>
                  <span
                    className={cx(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      checkTone(run.status),
                    )}
                  >
                    {run.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {run.findings} findings | started {run.startedAgo} | duration {run.duration}
                </p>
                <p className="mt-1 text-xs text-slate-700">{run.note}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
