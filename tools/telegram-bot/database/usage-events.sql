-- Applied through Supabase migrations on 2026-11-03. Service-role only. Never stores message content.
create table public.sb_usage_events (
 id bigint generated always as identity primary key,
 telegram_id bigint,
 action text not null check (char_length(action)<=40),
 model text check (char_length(model)<=60),
 input_tokens integer not null default 0,
 output_tokens integer not null default 0,
 images integer not null default 0,
 created_at timestamptz not null default now()
);
create index sb_usage_events_created on public.sb_usage_events(created_at);
alter table public.sb_usage_events enable row level security;
revoke all on public.sb_usage_events from anon,authenticated;
grant select,insert,delete on public.sb_usage_events to service_role;
