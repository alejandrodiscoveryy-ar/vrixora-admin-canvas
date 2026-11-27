import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid retry storms during temporary backend outages. Mutations keep their own defaults.
        retry: 1,
        retryDelay: (attempt) => Math.min(5_000 * 2 ** attempt, 30_000) + Math.floor(Math.random() * 1_000),
        refetchIntervalInBackground: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
