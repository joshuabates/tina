import { cn } from "@/lib/utils";

interface MonoTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

function MonoText({ className, children, ...props }: MonoTextProps) {
  return (
    <span className={cn("font-mono", className)} {...props}>
      {children}
    </span>
  );
}

export { MonoText };
export type { MonoTextProps };
