create table public.sb_checkout_admissions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 checkout_session_id text unique,
 created_at timestamptz not null default now()
);
alter table public.sb_checkout_admissions enable row level security;
revoke all on public.sb_checkout_admissions from public,anon,authenticated;
grant select,insert,update,delete on public.sb_checkout_admissions to service_role;
create function public.sb_reserve_checkout_capacity(p_user uuid,p_capacity integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare occupied integer;
begin
 if p_capacity<1 or p_capacity>100 then raise exception 'invalid capacity'; end if;
 perform pg_advisory_xact_lock(hashtext('social-banana-instagram-slots'));
 if exists(select 1 from public.sb_checkout_admissions where user_id=p_user)
 or exists(select 1 from public.sb_paid_instagram_clients where user_id=p_user) then return true; end if;
 select count(*) into occupied from (
  select user_id from public.sb_checkout_admissions union select user_id from public.sb_paid_instagram_clients
 ) clients;
 if occupied>=p_capacity then return false; end if;
 insert into public.sb_checkout_admissions(user_id) values(p_user);
 return true;
end; $$;
revoke all on function public.sb_reserve_checkout_capacity(uuid,integer) from public,anon,authenticated;
grant execute on function public.sb_reserve_checkout_capacity(uuid,integer) to service_role;
