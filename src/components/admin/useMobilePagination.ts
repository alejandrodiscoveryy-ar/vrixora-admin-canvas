import { useMemo, useState } from "react";

export function useMobilePagination<T>(rows: T[], pageSize = 10) {
  const [visible, setVisible] = useState(pageSize);
  const sliced = useMemo(() => rows.slice(0, visible), [rows, visible]);
  const canLoadMore = rows.length > visible;

  return {
    sliced,
    total: rows.length,
    visible,
    canLoadMore,
    loadMore: () => setVisible((current) => current + pageSize),
    reset: () => setVisible(pageSize),
  };
}
