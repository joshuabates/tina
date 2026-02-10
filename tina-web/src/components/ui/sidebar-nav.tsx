import { cn } from "@/lib/utils";
import { SidebarItem, type SidebarItemProps } from "./sidebar-item";

interface SidebarProject {
  name: string;
  active?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
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
          <div key={project.name}>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors",
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
