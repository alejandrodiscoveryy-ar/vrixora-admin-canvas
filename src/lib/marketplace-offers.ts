import { getSupabaseClient } from "@/lib/supabase";

// Campaign catalog only. These RPCs never change commission or wallet balances.
export type MarketplaceOfferKind =
  | "commission_free"
  | "commission_reduced"
  | "free_rides"
  | "wallet_credit"
  | "referral_bonus"
  | "reactivation"
  | "custom";
export type MarketplaceOfferAudience =
  | "new_drivers"
  | "active_drivers"
  | "inactive_drivers"
  | "all_drivers"
  | "selected_drivers";
export type MarketplaceOfferActivation = "automatic" | "manual" | "code";
export type MarketplaceOfferTrigger = "onboarding" | "first_job";
export type MarketplaceOfferStatus = "draft" | "paused" | "archived";
export type MarketplaceOfferStacking = "best_only" | "exclusive";

export interface MarketplaceOfferCampaign {
  id: string;
  project_id: string;
  name: string;
  description: string;
  kind: MarketplaceOfferKind;
  benefit_value: number;
  benefit_duration_days: number | null;
  benefit_ride_limit: number | null;
  begins_at: string;
  closes_at: string;
  audience: MarketplaceOfferAudience;
  audience_rules: Record<string, unknown>;
  activation: MarketplaceOfferActivation;
  activation_trigger: MarketplaceOfferTrigger;
  redemption_code: string | null;
  max_participants: number | null;
  max_budget_cup: number | null;
  max_uses_per_driver: number;
  priority: number;
  stacking: MarketplaceOfferStacking;
  terms: string;
  status: MarketplaceOfferStatus;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceOfferDraft {
  id?: string;
  name: string;
  description: string;
  kind: MarketplaceOfferKind;
  benefitValue: number;
  benefitDurationDays: number | null;
  benefitRideLimit: number | null;
  beginsAt: string;
  closesAt: string;
  audience: MarketplaceOfferAudience;
  audienceRules: Record<string, unknown>;
  activation: MarketplaceOfferActivation;
  activationTrigger: MarketplaceOfferTrigger;
  redemptionCode: string | null;
  maxParticipants: number | null;
  maxBudgetCup: number | null;
  maxUsesPerDriver: number;
  priority: number;
  stacking: MarketplaceOfferStacking;
  terms: string;
}

export async function listMarketplaceOfferCampaigns(
  projectId: string,
): Promise<MarketplaceOfferCampaign[]> {
  const { data, error } = await getSupabaseClient().rpc("admin_list_marketplace_offer_campaigns", {
    target_project_id: projectId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketplaceOfferCampaign[];
}

export async function saveMarketplaceOfferCampaign(
  projectId: string,
  value: MarketplaceOfferDraft,
): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("admin_save_marketplace_offer_campaign", {
    target_project_id: projectId,
    target_id: value.id ?? null,
    target_name: value.name.trim(),
    target_description: value.description.trim(),
    target_kind: value.kind,
    target_benefit_value: value.benefitValue,
    target_benefit_duration_days: value.benefitDurationDays,
    target_benefit_ride_limit: value.benefitRideLimit,
    target_begins_at: value.beginsAt,
    target_closes_at: value.closesAt,
    target_audience: value.audience,
    target_audience_rules: value.audienceRules,
    target_activation: value.activation,
    target_activation_trigger: value.activationTrigger,
    target_redemption_code: value.redemptionCode,
    target_max_participants: value.maxParticipants,
    target_max_budget_cup: value.maxBudgetCup,
    target_max_uses_per_driver: value.maxUsesPerDriver,
    target_priority: value.priority,
    target_stacking: value.stacking,
    target_terms: value.terms,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function archiveMarketplaceOfferCampaign(
  projectId: string,
  id: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("admin_archive_marketplace_offer_campaign", {
    target_project_id: projectId,
    target_id: id,
    target_reason: "Archivada expresamente desde el panel comercial",
  });
  if (error) throw new Error(error.message);
}
