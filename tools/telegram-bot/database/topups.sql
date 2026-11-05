-- Service-role only. A recharge is credited once from a signed Stripe webhook.
create table public.sb_topups (
 stripe_session_id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 livemode boolean not null,
 payment_intent text,
 amount_cents integer not null check (amount_cents>0),
 credit_cents integer not null check (credit_cents>=0),
 status text not null default 'paid' check (status in ('paid','reversed')),
 created_at timestamptz not null default now(),
 reversed_at timestamptz
);
create index sb_topups_user on public.sb_topups(user_id,livemode,status);
create index sb_topups_intent on public.sb_topups(payment_intent);
alter table public.sb_topups enable row level security;
revoke all on public.sb_topups from anon,authenticated;
grant select,insert,update,delete on public.sb_topups to service_role;
