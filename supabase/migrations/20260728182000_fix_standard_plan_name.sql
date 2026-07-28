update public.license_plans
set name = 'Estándar',
    updated_at = now()
where code = 'standard'
  and name = 'EstÃ¡ndar';
