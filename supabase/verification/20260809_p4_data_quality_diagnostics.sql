-- P4 read-only production data-quality diagnostics.
-- Expected result for every query: zero rows. This file performs no writes.

-- Duplicate normalized profile emails.
select lower(btrim(email)) as normalized_email, count(*) as occurrences
from public.profiles
where nullif(btrim(email), '') is not null
group by lower(btrim(email))
having count(*) > 1;

-- More than one license for the same project and user.
select project_id, user_id, count(*) as occurrences
from public.licenses
group by project_id, user_id
having count(*) > 1;

-- Duplicate non-null payment idempotency keys.
select idempotency_key, count(*) as occurrences
from public.payments
where idempotency_key is not null
group by idempotency_key
having count(*) > 1;

-- Confirmed payments without a receipt.
select payment.id, payment.project_id, payment.license_id, payment.charged_at
from public.payments payment
left join public.billing_receipts receipt on receipt.payment_id = payment.id
where payment.status in ('paid', 'complimentary')
  and receipt.id is null;

-- Receipts whose project or license does not match their payment.
select receipt.id, receipt.payment_id, receipt.project_id, receipt.license_id
from public.billing_receipts receipt
join public.payments payment on payment.id = receipt.payment_id
where receipt.project_id is distinct from payment.project_id
   or receipt.license_id is distinct from payment.license_id;

-- Payments whose license belongs to another project.
select payment.id, payment.project_id, payment.license_id
from public.payments payment
join public.licenses license on license.id = payment.license_id
where payment.project_id is distinct from license.project_id;

-- More than one active linked lead for the same project and user.
select project_id, linked_user_id, count(*) as occurrences
from public.commercial_leads
where linked_user_id is not null and archived_at is null
group by project_id, linked_user_id
having count(*) > 1;

-- Leads linked to campaigns from another project.
select lead.id as lead_id, lead.project_id as lead_project_id,
       campaign.id as campaign_id, campaign.project_id as campaign_project_id
from public.commercial_leads lead
join public.commercial_campaigns campaign on campaign.id = lead.campaign_id
where lead.project_id is distinct from campaign.project_id;

-- Members with missing or unknown roles.
select member.project_id, member.user_id, member.role
from public.project_members member
left join public.project_roles role on role.code = member.role
where role.code is null;

-- Projects without an Owner.
select project.id, project.name
from public.projects project
where not exists (
  select 1
  from public.project_members member
  where member.project_id = project.id and member.role = 'owner'
);
