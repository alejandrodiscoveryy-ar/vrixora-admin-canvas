import { cn } from "@/lib/utils";

export function ResponsiveDataView({
  desktop,
  mobile,
  breakpoint = "md",
  className,
}: {
  desktop: React.ReactNode;
  mobile: React.ReactNode;
  breakpoint?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className={breakpoint === "md" ? "hidden md:block" : "hidden lg:block"}>{desktop}</div>
      <div className={breakpoint === "md" ? "md:hidden" : "lg:hidden"}>{mobile}</div>
    </div>
  );
}
