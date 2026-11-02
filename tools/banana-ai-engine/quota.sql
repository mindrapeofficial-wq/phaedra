-- Already applied to Supabase Social Banana on 2026-10-31 through migration
-- add_banana_ai_daily_generation_quota. Kept here for audit and recovery.
create table if not exists public.sb_ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  request_count integer not null default 0 check (request_count >= 0 and request_count <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,usage_day)
);
alter table public.sb_ai_daily_usage enable row level security;
revoke all on table public.sb_ai_daily_usage from public,anon,authenticated;
create or replace function public.sb_ai_take_quota()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  current_count integer;
  utc_day date;
begin
  caller := (select auth.uid());
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  utc_day := (now() at time zone 'UTC')::date;
  insert into public.sb_ai_daily_usage (user_id,usage_day,request_count)
  values (caller,utc_day,1)
  on conflict (user_id,usage_day) do update
    set request_count = public.sb_ai_daily_usage.request_count+1,updated_at=now()
    where public.sb_ai_daily_usage.request_count < 20
  returning request_count into current_count;
  if current_count is null then
    return jsonb_build_object('allowed',false,'used',20,'remaining',0,'limit',20);
  end if;
  return jsonb_build_object('allowed',true,'used',current_count,'remaining',20-current_count,'limit',20);
end;
$$;
revoke all on function public.sb_ai_take_quota() from public,anon;
grant execute on function public.sb_ai_take_quota() to authenticated;
comment on table public.sb_ai_daily_usage is 'Per-user daily metered quota for Banana AI generations. No prompts or Instagram private data are stored.';
comment on function public.sb_ai_take_quota() is 'Authenticated-only atomic quota (20 calls/UTC day).';
