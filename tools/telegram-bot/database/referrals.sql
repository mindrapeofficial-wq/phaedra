-- Service-role only. A referral qualifies on the referred customer's first verified live payment.
create table public.sb_referral_codes (
 telegram_id bigint primary key references public.sb_telegram_users(telegram_id) on delete cascade,
 code text unique not null check (code ~ '^[a-f0-9]{10}$'),
 created_at timestamptz not null default now()
);
create table public.sb_referrals (
 id bigint generated always as identity primary key,
 referrer_telegram bigint not null references public.sb_telegram_users(telegram_id) on delete cascade,
 referred_telegram bigint not null unique references public.sb_telegram_users(telegram_id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','qualified','rewarded','void')),
 stripe_subscription_id text,
 void_reason text,
 created_at timestamptz not null default now(),
 qualified_at timestamptz,
 rewarded_at timestamptz,
 check (referrer_telegram <> referred_telegram)
);
create index sb_referrals_referrer on public.sb_referrals(referrer_telegram,status);
alter table public.sb_referral_codes enable row level security;
alter table public.sb_referrals enable row level security;
revoke all on public.sb_referral_codes, public.sb_referrals from anon,authenticated;
grant select,insert,update,delete on public.sb_referral_codes, public.sb_referrals to service_role;

create or replace function public.sb_claim_referral(p_code text,p_referred bigint) returns text language plpgsql security invoker set search_path=public as $$
declare referrer bigint; referred_account uuid; referrer_account uuid;
begin
 select telegram_id into referrer from public.sb_referral_codes where code=p_code;
 if referrer is null then return 'invalid'; end if;
 if referrer=p_referred then return 'self'; end if;
 select user_id into referred_account from public.sb_telegram_users where telegram_id=p_referred;
 select user_id into referrer_account from public.sb_telegram_users where telegram_id=referrer;
 if referred_account is not null and referred_account=referrer_account then return 'self'; end if;
 if referred_account is not null and exists(select 1 from public.sb_subscriptions s where s.user_id=referred_account and s.livemode=true) then return 'existing_customer'; end if;
 insert into public.sb_referrals(referrer_telegram,referred_telegram) values(referrer,p_referred) on conflict(referred_telegram) do nothing;
 if not found then return 'already_referred'; end if;
 return 'recorded';
end; $$;
revoke all on function public.sb_claim_referral(text,bigint) from public,anon,authenticated;
grant execute on function public.sb_claim_referral(text,bigint) to service_role;

create or replace function public.sb_track_referral_payment() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.livemode is distinct from true then return new; end if;
 if new.status='active' and new.risk_hold=false and new.paid_until>now() then
  update public.sb_referrals r set status='qualified',qualified_at=now(),stripe_subscription_id=new.stripe_subscription_id
  from public.sb_telegram_users u where u.telegram_id=r.referred_telegram and u.user_id=new.user_id and r.status='pending';
 elsif new.risk_hold=true then
  update public.sb_referrals r set status='void',void_reason=coalesce(new.risk_reason,'risk_hold')
  from public.sb_telegram_users u where u.telegram_id=r.referred_telegram and u.user_id=new.user_id and r.status in ('pending','qualified');
 end if;
 return new;
end; $$;
revoke all on function public.sb_track_referral_payment() from public,anon,authenticated;
grant execute on function public.sb_track_referral_payment() to service_role;
create trigger sb_track_referral_payment after insert or update on public.sb_subscriptions for each row execute function public.sb_track_referral_payment();
