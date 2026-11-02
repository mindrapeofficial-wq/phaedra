-- Applied through Supabase migrations on 2026-11-02. Service-role only.
create unique index sb_telegram_one_account on public.sb_telegram_users(user_id) where user_id is not null;
create table public.sb_telegram_links (
 telegram_id bigint primary key references public.sb_telegram_users(telegram_id) on delete cascade,
 code_hash text unique not null, expires_at timestamptz not null
);
alter table public.sb_telegram_links enable row level security;
revoke all on public.sb_telegram_links from anon,authenticated;
grant select,insert,update,delete on public.sb_telegram_links to service_role;
create or replace function public.sb_link_telegram(p_hash text,p_user uuid) returns bigint language plpgsql security invoker set search_path=public as $$
declare linked bigint; existing uuid;
begin
 select telegram_id into linked from public.sb_telegram_links where code_hash=p_hash and expires_at>now() for update;
 if linked is null then return null; end if;
 select user_id into existing from public.sb_telegram_users where telegram_id=linked for update;
 if existing is not null and existing<>p_user then return null; end if;
 if exists(select 1 from public.sb_telegram_users where user_id=p_user and telegram_id<>linked) then return null; end if;
 update public.sb_telegram_users set user_id=p_user,updated_at=now() where telegram_id=linked;
 delete from public.sb_telegram_links where telegram_id=linked;
 return linked;
end; $$;
revoke all on function public.sb_link_telegram(text,uuid) from public,anon,authenticated;
grant execute on function public.sb_link_telegram(text,uuid) to service_role;
