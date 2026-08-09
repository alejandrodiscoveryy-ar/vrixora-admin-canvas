import { createFileRoute, notFound } from "@tanstack/react-router";
import { ReviewAdmin } from "@/features/review/ReviewAdmin";

const sections = new Set([
  "clientes",
  "licencias",
  "planes",
  "pagos",
  "comercial",
  "empleados",
  "rendimiento",
  "configuracion",
  "auditoria",
]);

export const Route = createFileRoute("/review/$token/$section")({
  beforeLoad: ({ params }) => {
    if (!sections.has(params.section)) throw notFound();
  },
  component: ReviewSectionPage,
});

function ReviewSectionPage() {
  const { token, section } = Route.useParams();
  return <ReviewAdmin token={token} section={section} />;
}
