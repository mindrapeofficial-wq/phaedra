-- Serialize per user per chat, so an order in the group never blocks the same user's private chat.
create or replace function public.sb_claim_bot_job(p_lease uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare job public.sb_bot_jobs; recovering boolean;
begin
 select j.* into job from public.sb_bot_jobs j
 where (j.status='pending' or (j.status='processing' and j.lease_until<now()))
 and not exists (select 1 from public.sb_bot_jobs earlier where earlier.telegram_id=j.telegram_id and earlier.chat_id=j.chat_id and earlier.update_id<>j.update_id
   and ((earlier.status='processing' and earlier.lease_until>=now()) or (earlier.status='pending' and earlier.update_id<j.update_id)))
 order by j.update_id for update skip locked limit 1;
 if not found then return null; end if;
 recovering := job.status='processing';
 update public.sb_bot_jobs set status='processing',lease=p_lease,lease_until=now()+interval '2 minutes',updated_at=now() where update_id=job.update_id;
 return to_jsonb(job)||jsonb_build_object('recovered',recovering);
end; $$;
revoke all on function public.sb_claim_bot_job(uuid) from public,anon,authenticated;
grant execute on function public.sb_claim_bot_job(uuid) to service_role;
