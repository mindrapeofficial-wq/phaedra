-- Service-role only. One active release plan per Telegram user.
create table public.sb_release_plans (
 id bigint generated always as identity primary key,
 telegram_id bigint not null references public.sb_telegram_users(telegram_id) on delete cascade,
 title text not null check (char_length(title) between 1 and 120),
 release_date date not null,
 status text not null default 'active' check (status in ('active','archived')),
 reminders_enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index sb_release_one_active on public.sb_release_plans(telegram_id) where status='active';
create table public.sb_release_tasks (
 id bigint generated always as identity primary key,
 plan_id bigint not null references public.sb_release_plans(id) on delete cascade,
 telegram_id bigint not null references public.sb_telegram_users(telegram_id) on delete cascade,
 position integer not null,
 title text not null,
 due_date date not null,
 done_at timestamptz,
 reminded_at timestamptz,
 unique (plan_id,position)
);
create index sb_release_tasks_due on public.sb_release_tasks(due_date) where done_at is null;
alter table public.sb_release_plans enable row level security;
alter table public.sb_release_tasks enable row level security;
revoke all on public.sb_release_plans, public.sb_release_tasks from anon,authenticated;
grant select,insert,update,delete on public.sb_release_plans, public.sb_release_tasks to service_role;
