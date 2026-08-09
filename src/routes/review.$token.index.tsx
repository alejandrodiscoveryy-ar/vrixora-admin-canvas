import { createFileRoute } from "@tanstack/react-router";
import { ReviewAdmin } from "@/features/review/ReviewAdmin";

export const Route = createFileRoute("/review/$token/")({
  component: ReviewIndexPage,
});

function ReviewIndexPage() {
  return <ReviewAdmin token={Route.useParams().token} />;
}
