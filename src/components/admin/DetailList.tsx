import { cn } from "@/lib/utils";

export type DetailListItem = {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
};

export function DetailList({
  items,
  columns = 1,
  className,
}: {
  items: DetailListItem[];
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3",
        columns === 2 ? "sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={index} className="min-w-0 border-b border-border-subtle pb-3 last:border-0">
          <dt className="text-xs font-medium text-text-tertiary">{item.label}</dt>
          <dd
            className={cn(
              "mt-1 break-words text-sm font-medium text-text-primary",
              item.mono ? "font-mono" : "",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
