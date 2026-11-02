-- Applied through Supabase migrations on 2026-11-02. Service-role only.
create table public.sb_creator_profiles(telegram_id bigint primary key, facts jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.sb_creator_profiles enable row level security;
revoke all on public.sb_creator_profiles from anon,authenticated;
grant select,insert,update,delete on public.sb_creator_profiles to service_role;
insert into public.sb_creator_profiles(telegram_id,facts)
select telegram_id,jsonb_object_agg(key,value) from (
 select distinct on (m.telegram_id,p.key) m.telegram_id,p.key,p.value
 from public.sb_bot_memory m cross join lateral jsonb_each(coalesce(m.state->'profile','{}'::jsonb)) p
 where m.telegram_id>0 and p.key not in ('welcomedAt','telegramName')
 order by m.telegram_id,p.key,m.updated_at desc
) latest group by telegram_id;
create or replace function public.sb_merge_creator_profile(p_user bigint,p_facts jsonb) returns void language sql security invoker set search_path=public as $$
insert into public.sb_creator_profiles(telegram_id,facts) values(p_user,p_facts)
on conflict(telegram_id) do update set facts=sb_creator_profiles.facts||excluded.facts,updated_at=now();
$$;
revoke all on function public.sb_merge_creator_profile(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.sb_merge_creator_profile(bigint,jsonb) to service_role;
