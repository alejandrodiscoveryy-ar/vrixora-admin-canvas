create index projects_default_trial_plan_idx
  on public.projects(default_trial_plan)
  where default_trial_plan is not null;
