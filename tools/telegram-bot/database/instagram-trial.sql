-- Applied through Supabase migrations on 2026-11-03. Service-role only. One trial exists at most.
create table public.sb_instagram_trial (
 id boolean primary key default true check (id),
 telegram_id bigint not null references public.sb_telegram_users(telegram_id) on delete cascade,
 claimed_at timestamptz not null default now(),
 ends_at timestamptz not null default now()+interval '3 days',
 ended_at timestamptz
);
alter table public.sb_instagram_trial enable row level security;
revoke all on public.sb_instagram_trial from anon,authenticated;
grant select,insert,update,delete on public.sb_instagram_trial to service_role;
create or replace function public.sb_claim_instagram_trial(p_user bigint) returns text language plpgsql security invoker set search_path=public as $$
declare holder bigint;
begin
 if not exists(select 1 from public.sb_telegram_users where telegram_id=p_user and user_id is not null) then return 'not_linked'; end if;
 insert into public.sb_instagram_trial(telegram_id) values(p_user) on conflict(id) do nothing;
 if found then return 'claimed'; end if;
 select telegram_id into holder from public.sb_instagram_trial;
 return case when holder=p_user then 'yours' else 'taken' end;
end; $$;
revoke all on function public.sb_claim_instagram_trial(bigint) from public,anon,authenticated;
grant execute on function public.sb_claim_instagram_trial(bigint) to service_role;
