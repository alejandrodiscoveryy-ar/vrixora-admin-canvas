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
        "grid grid-cols-1 items-stretch min-[360px]:grid-cols-2 [&>*]:min-w-0",
        desktopColumns,
        (columns === 3 || columns === 5) &&
          "min-[360px]:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1",
        density === "compact" ? "gap-2.5 sm:gap-3" : "gap-3 sm:gap-4 xl:gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
