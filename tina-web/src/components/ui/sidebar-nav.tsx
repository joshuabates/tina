import { cn } from "@/lib/utils";
import { SidebarItem, type SidebarItemProps } from "./sidebar-item";

interface SidebarProject {
  name: string;
  active?: boolean;
  items: SidebarItemProps[];
}

interface SidebarNavProps extends React.HTMLAttributes<HTMLDivElement> {
  projects: SidebarProject[];
  activeDescendantId?: string;
}

function SidebarNav({ projects, activeDescendantId, className, ...props }: SidebarNavProps) {
  return (
    <div className={cn("flex flex-col overflow-hidden bg-sidebar", className)} {...props}>
      <div className="px-2 py-1.5 border-b border-border/50 bg-muted/20">
        <h2 className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
          PROJECTS
        </h2>
      </div>
      <div
        className="flex-1 overflow-y-auto p-1 space-y-0.5"
        role="list"
        aria-activedescendant={activeDescendantId}
      >
        {projects.map((project) => (
          <div key={project.name}>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 cursor-pointer rounded transition-colors",
                project.active
                  ? "bg-muted/50 text-primary"
                  : "text-muted-foreground hover:bg-muted/30"
              )}
            >
              <span className="text-xs font-medium flex-1 truncate">
                {project.name}
              </span>
            </div>
            {project.items.length > 0 && (
              <div className="ml-4 space-y-0.5 border-l border-border/50">
                {project.items.map((item) => (
                  <SidebarItem key={item.label} {...item} />
                ))}
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
