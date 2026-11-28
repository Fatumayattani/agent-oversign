-- Agent Oversign: control plane schema.
-- The Oversign service writes with the secret key (bypasses row-level security).
-- The dashboard and phone app sign in as the owner and can only do what these rules allow.

-- Who counts as an owner. Only reachable through is_owner(), never directly.
create table public.owners (
  email text primary key
);

insert into public.owners (email) values ('fatuma@duniahub.xyz');

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.owners where email = (auth.jwt() ->> 'email'));
$$;

-- One row per agent wallet. frozen = true is the kill switch.
create table public.agent_state (
  agent text primary key,
  frozen boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Every decision Oversign makes. body holds the exact signed record contents,
-- so verification never depends on how the columns are read back.
create table public.decisions (
  id uuid primary key,
  created_at timestamptz not null default now(),
  agent text not null,
  request_key text not null,
  url text not null,
  decision text not null check (decision in ('ALLOW', 'REVIEW', 'BLOCK')),
  reasons jsonb not null default '[]'::jsonb,
  payment jsonb,
  policy_hash text not null,
  approved_by_owner boolean not null default false,
  record_hash text not null,
  attestor text not null,
  signature text not null,
  body jsonb not null,
  anchor_transaction text,
  settlement_transaction text
);

create index decisions_agent_created_idx on public.decisions (agent, created_at desc);

-- Payments that were signed. Budgets are counted from here.
create table public.payments (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  timestamp_ms bigint not null,
  agent text not null,
  payee text not null,
  amount text not null,
  request_key text not null,
  decision_id uuid references public.decisions (id)
);

create index payments_agent_time_idx on public.payments (agent, timestamp_ms desc);

-- Owner approvals. One approval clears one REVIEW decision, once.
create table public.approvals (
  decision_id uuid primary key references public.decisions (id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by text not null default (auth.jwt() ->> 'email'),
  used_at timestamptz
);

-- Row-level security: nothing is readable or writable unless a rule allows it.
alter table public.owners enable row level security;
alter table public.agent_state enable row level security;
alter table public.decisions enable row level security;
alter table public.payments enable row level security;
alter table public.approvals enable row level security;

create policy "owner reads decisions" on public.decisions
  for select to authenticated using (public.is_owner());

create policy "owner reads payments" on public.payments
  for select to authenticated using (public.is_owner());

create policy "owner reads agent state" on public.agent_state
  for select to authenticated using (public.is_owner());

create policy "owner freezes or unfreezes" on public.agent_state
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner reads approvals" on public.approvals
  for select to authenticated using (public.is_owner());

-- An owner can approve only a REVIEW decision. A BLOCK can never be approved.
create policy "owner approves review decisions" on public.approvals
  for insert to authenticated
  with check (
    public.is_owner()
    and exists (
      select 1 from public.decisions d
      where d.id = decision_id and d.decision = 'REVIEW'
    )
  );

-- Live updates for the dashboard and phone.
alter publication supabase_realtime add table public.decisions, public.agent_state, public.approvals;

-- Explicit grants. New Supabase projects no longer expose public tables to the Data API
-- automatically, so each role gets only what it needs. anon gets nothing.
-- owners is never granted: only is_owner() reads it.

-- The Oversign service (secret key).
grant select, insert, update, delete on public.decisions, public.payments, public.approvals, public.agent_state to service_role;
grant usage, select on all sequences in schema public to service_role;

-- The signed-in owner (dashboard and phone). Row-level security still decides which rows.
grant execute on function public.is_owner() to authenticated;
grant select on public.decisions, public.payments, public.approvals, public.agent_state to authenticated;
grant update (frozen, updated_at, updated_by) on public.agent_state to authenticated;
grant insert (decision_id) on public.approvals to authenticated;

-- The policy the service loaded, so the dashboard shows the rules actually in force.
alter table public.agent_state add column if not exists policy jsonb;

-- Live spending updates for the dashboard.
alter publication supabase_realtime add table public.payments;

-- What Oversign saw before deciding (decoded instructions, simulation, timings).
alter table public.decisions add column if not exists inspection jsonb;
