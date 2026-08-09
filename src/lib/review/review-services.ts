import { reviewSnapshot } from "./fixtures";

// Intentionally read-only: review consumers cannot obtain mutation methods.
export const reviewServices = Object.freeze({
  snapshot: () => reviewSnapshot,
});
