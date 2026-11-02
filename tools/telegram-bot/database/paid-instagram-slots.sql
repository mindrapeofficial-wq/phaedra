-- Applied through Supabase migrations on 2026-11-02. Service-role only.
create table public.sb_instagram_slots(telegram_id bigint primary key references public.sb_telegram_users(telegram_id), slot_number integer unique not null check(slot_number>0), allocated_at timestamptz not null default now());
alter table public.sb_instagram_slots enable row level security;
revoke all on public.sb_instagram_slots from anon,authenticated;
grant select,insert,update,delete on public.sb_instagram_slots to service_role;
create or replace function public.sb_claim_instagram_slot(p_user bigint,p_capacity integer) returns integer language plpgsql security invoker set search_path=public as $$
declare result integer;
begin
 if p_capacity<1 or p_capacity>100 then raise exception 'invalid capacity'; end if;
 perform pg_advisory_xact_lock(hashtext('social-banana-instagram-slots'));
 if not exists(select 1 from public.sb_telegram_users u join public.sb_subscriptions s on s.user_id=u.user_id
 where u.telegram_id=p_user and s.livemode=true and s.status='active' and s.risk_hold=false and s.paid_until>now()) then return null; end if;
 select slot_number into result from public.sb_instagram_slots where telegram_id=p_user;
 if result is not null then return result; end if;
 select n into result from generate_series(1,p_capacity) n where not exists(select 1 from public.sb_instagram_slots where slot_number=n) order by n limit 1;
 if result is null then return null; end if;
 insert into public.sb_instagram_slots(telegram_id,slot_number) values(p_user,result);
 return result;
end; $$;
revoke all on function public.sb_claim_instagram_slot(bigint,integer) from public,anon,authenticated;
grant execute on function public.sb_claim_instagram_slot(bigint,integer) to service_role;
