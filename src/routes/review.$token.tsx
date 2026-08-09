import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/review/$token")({
  head: () => ({
    meta: [
      { title: "Revisión visual — VRIXORA" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: () => <Outlet />,
});
