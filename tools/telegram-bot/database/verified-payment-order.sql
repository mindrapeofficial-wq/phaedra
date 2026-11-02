-- Follow-up to paid-instagram-slots.sql: allocation follows first verified live payment.
create table public.sb_paid_instagram_clients(user_id uuid primary key references auth.users(id), order_id bigint generated always as identity unique, first_paid_at timestamptz not null default now());
alter table public.sb_paid_instagram_clients enable row level security;
revoke all on public.sb_paid_instagram_clients from anon,authenticated;
grant select,insert,update,delete on public.sb_paid_instagram_clients to service_role;
grant usage,select on sequence public.sb_paid_instagram_clients_order_id_seq to service_role;
create or replace function public.sb_note_instagram_payment() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.livemode=true and new.status='active' and new.risk_hold=false and new.paid_until>now() then
   insert into public.sb_paid_instagram_clients(user_id) values(new.user_id) on conflict(user_id) do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.sb_note_instagram_payment() from public,anon,authenticated;
grant execute on function public.sb_note_instagram_payment() to service_role;
create trigger sb_record_first_instagram_payment after insert or update on public.sb_subscriptions for each row execute function public.sb_note_instagram_payment();
insert into public.sb_paid_instagram_clients(user_id,first_paid_at)
select user_id,min(observed_at) from public.sb_subscriptions where livemode=true and status='active' and risk_hold=false and paid_until>now()
group by user_id order by min(observed_at),user_id;
create or replace function public.sb_claim_instagram_slot(p_user bigint,p_capacity integer) returns integer language plpgsql security invoker set search_path=public as $$
declare result integer; customer uuid;
begin
 if p_capacity<1 or p_capacity>100 then raise exception 'invalid capacity'; end if;
 perform pg_advisory_xact_lock(hashtext('social-banana-instagram-slots'));
 select u.user_id into customer from public.sb_telegram_users u
 where u.telegram_id=p_user and exists(select 1 from public.sb_subscriptions s where s.user_id=u.user_id
 and s.livemode=true and s.status='active' and s.risk_hold=false and s.paid_until>now());
 if customer is null then return null; end if;
 select slot_number into result from public.sb_instagram_slots where telegram_id=p_user;
 if result is not null then return result; end if;
 select count(*)::integer into result from public.sb_paid_instagram_clients earlier
 where earlier.order_id <= (select order_id from public.sb_paid_instagram_clients where user_id=customer);
 if result<1 or result>p_capacity then return null; end if;
 if exists(select 1 from public.sb_instagram_slots where slot_number=result) then return null; end if;
 insert into public.sb_instagram_slots(telegram_id,slot_number) values(p_user,result);
 return result;
end; $$;
revoke all on function public.sb_claim_instagram_slot(bigint,integer) from public,anon,authenticated;
grant execute on function public.sb_claim_instagram_slot(bigint,integer) to service_role;
