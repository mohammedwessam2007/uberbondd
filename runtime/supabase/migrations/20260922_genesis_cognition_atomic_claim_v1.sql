-- GENESIS cognition atomic claim v1
-- Service-role only. Prevents concurrent suppliers from racing on the same pending job.

create or replace function public.claim_genesis_cognition_job(
  p_supplier_id text,
  p_supplier_class text,
  p_supplier_capabilities jsonb,
  p_max_observed_cost_microusd bigint,
  p_lease_seconds integer default 300
)
returns setof public.genesis_cognition_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  picked_id uuid;
begin
  if p_supplier_id is null
     or p_supplier_class not in ('DETERMINISTIC','LOCAL','CHEAP_CLOUD','FRONTIER')
     or jsonb_typeof(p_supplier_capabilities) <> 'array'
     or p_max_observed_cost_microusd < 0
     or p_lease_seconds < 30
     or p_lease_seconds > 900 then
    return;
  end if;

  select j.id into picked_id
  from public.genesis_cognition_jobs j
  where j.status='PENDING'
    and j.expires_at > now()
    and coalesce(j.requirements->'allowedSupplierClasses','[]'::jsonb) ? p_supplier_class
    and p_max_observed_cost_microusd <= j.max_cost_microusd
    and not exists (
      select 1
      from jsonb_array_elements_text(coalesce(j.requirements->'requiredCapabilities','[]'::jsonb)) required(capability)
      where not (p_supplier_capabilities ? required.capability)
    )
  order by j.priority desc, j.created_at asc
  for update skip locked
  limit 1;

  if picked_id is null then
    return;
  end if;

  return query
  update public.genesis_cognition_jobs j
  set status='LEASED',
      supplier_id=p_supplier_id,
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      attempt_count=j.attempt_count+1,
      updated_at=now()
  where j.id=picked_id
    and j.status='PENDING'
  returning j.*;
end;
$$;

revoke all on function public.claim_genesis_cognition_job(text,text,jsonb,bigint,integer) from public, anon, authenticated;
grant execute on function public.claim_genesis_cognition_job(text,text,jsonb,bigint,integer) to service_role;
