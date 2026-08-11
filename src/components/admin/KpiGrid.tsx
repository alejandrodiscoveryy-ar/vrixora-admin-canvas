import { cn } from "@/lib/utils";

export function KpiGrid({
  children,
  columns = 4,
  density = "comfortable",
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5;
  density?: "compact" | "comfortable";
  className?: string;
}) {
  const desktopColumns = {
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
  }[columns];

  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2",
        desktopColumns,
        density === "compact" ? "gap-3" : "gap-4 xl:gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
