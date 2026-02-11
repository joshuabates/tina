import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { SidebarItem, type SidebarItemProps } from "./sidebar-item";

interface SidebarProject {
  id: string;
  name: string;
  active?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onDelete?: React.MouseEventHandler<HTMLButtonElement>;
  deleting?: boolean;
  items: SidebarItemProps[];
}

interface SidebarNavProps extends React.HTMLAttributes<HTMLDivElement> {
  projects: SidebarProject[];
  activeDescendantId?: string;
}

function SidebarNav({ projects, activeDescendantId, className, ...props }: SidebarNavProps) {
  return (
    <div className={cn("flex flex-col overflow-hidden bg-sidebar", className)} {...props}>
      <div className="px-2.5 py-1 border-b border-border/50 bg-muted/20">
        <h2 className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/90">
          PROJECTS
        </h2>
      </div>
      <div
        className="flex-1 overflow-y-auto p-1.5 space-y-1"
        role="list"
        aria-activedescendant={activeDescendantId}
      >
        {projects.map((project) => (
          <div key={project.id}>
            <div
              className={cn(
                "group/project flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors",
                project.active
                  ? "bg-muted/45 text-foreground"
                  : "text-muted-foreground/95",
                project.onClick && "cursor-pointer hover:bg-muted/25 hover:text-foreground"
              )}
              onClick={project.onClick}
            >
              <span className="text-[13px] font-medium leading-tight flex-1 truncate">
                {project.name}
              </span>
              {project.onDelete && (
                <button
                  type="button"
                  aria-label={`Delete project ${project.name}`}
                  title={`Delete ${project.name}`}
                  disabled={project.deleting === true}
                  className={cn(
                    "ml-auto inline-flex h-6 w-6 items-center justify-center rounded border border-border/60 transition",
                    "opacity-0 pointer-events-none group-hover/project:opacity-100 group-hover/project:pointer-events-auto",
                    "focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    project.deleting
                      ? "cursor-not-allowed text-muted-foreground/50"
                      : "text-muted-foreground/80 hover:text-destructive hover:bg-destructive/10"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    project.onDelete?.(event);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            {project.items.length > 0 && (
              <div className="ml-3.5 pl-1.5 space-y-0.5 border-l border-border/45">
                {project.items.map((item, index) => {
                  const itemKey =
                    item["data-orchestration-id"] ?? item.id ?? `${project.name}-${index}`
                  return <SidebarItem key={itemKey} {...item} />
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { SidebarNav };
export type { SidebarNavProps, SidebarProject };
