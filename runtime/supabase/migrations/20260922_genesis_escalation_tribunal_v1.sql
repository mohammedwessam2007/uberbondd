-- GENESIS escalation tribunal and source-realization queue.
-- Runtime credentials are generated inside PostgreSQL/Supabase Vault and are never stored in this repository.

create table if not exists public.genesis_escalation_decisions (
  candidate_id text primary key references public.genesis_runtime_candidates(candidate_id) on delete cascade,
  decision text not null check (decision = any(array[
    'IMPLEMENT_NOW','ESCALATE_LOCAL_SEMANTIC','ESCALATE_PAID_SEMANTIC',
    'WAIT_PAID_SEMANTIC_AUTHORITY','WAIT_CALLABLE_SEMANTIC_SUPPLIER',
    'WAIT_REALITY_EVIDENCE','HOLD','ALREADY_IMPLEMENTED'
  ])),
  score double precision not null check (score between 0 and 1),
  reason_codes jsonb not null default '[]'::jsonb,
  reality_blockers jsonb not null default '[]'::jsonb,
  semantic_needs jsonb not null default '[]'::jsonb,
  unresolved jsonb not null default '[]'::jsonb,
  source_receipt_id uuid references public.genesis_cognition_receipts(id),
  paid_provider_enabled boolean not null default false,
  execution_authority text not null default 'NONE' check (execution_authority='NONE'),
  updated_at timestamptz not null default now()
);

create table if not exists public.genesis_realization_queue (
  candidate_id text primary key references public.genesis_runtime_candidates(candidate_id) on delete cascade,
  status text not null default 'PENDING' check (status = any(array['PENDING','CLAIMED','SOURCE_IMPLEMENTED','REJECTED','BLOCKED'])),
  priority double precision not null check (priority between 0 and 1),
  source_only boolean not null default true check (source_only=true),
  max_files integer not null default 6 check (max_files between 1 and 12),
  max_changed_lines integer not null default 900 check (max_changed_lines between 50 and 3000),
  external_effect_authority text not null default 'NONE' check (external_effect_authority='NONE'),
  business_effect_authority text not null default 'NONE' check (business_effect_authority='NONE'),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists genesis_escalation_decisions_decision_score_idx
on public.genesis_escalation_decisions(decision,score desc);

alter table public.genesis_escalation_decisions enable row level security;
alter table public.genesis_realization_queue enable row level security;
revoke all on public.genesis_escalation_decisions from anon, authenticated;
revoke all on public.genesis_realization_queue from anon, authenticated;
grant all on public.genesis_escalation_decisions to service_role;
grant all on public.genesis_realization_queue to service_role;
