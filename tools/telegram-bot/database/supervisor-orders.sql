-- Applied through Supabase migrations on 2026-11-03. Service-role only.
create table public.sb_supervisor_orders (
 id bigint generated always as identity primary key,
 action text not null check (action in ('pause_initiative','resume_initiative','nudge_group','notify_owner')),
 pause_hours integer check (pause_hours between 1 and 24),
 note text check (char_length(note)<=300),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '6 hours',
 applied_at timestamptz
);
create index sb_supervisor_orders_pending on public.sb_supervisor_orders(created_at) where applied_at is null;
alter table public.sb_supervisor_orders enable row level security;
revoke all on public.sb_supervisor_orders from anon,authenticated;
grant select,insert,update on public.sb_supervisor_orders to service_role;
