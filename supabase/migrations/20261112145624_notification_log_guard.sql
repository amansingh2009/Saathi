create or replace function public.record_emergency_notification(p_event_id uuid,p_recipient_id uuid,p_status text,p_provider_message_id text default null,p_error_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.emergency_events; l public.notification_logs;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into e from public.emergency_events where id=p_event_id;
  if not found or (auth.uid()<>e.elderly_user_id and not private.is_family_caregiver(e.family_id)) then raise exception 'event unavailable' using errcode='42501'; end if;
  if p_status not in ('sent','failed','not_configured','no_registered_devices') then raise exception 'invalid status' using errcode='22023'; end if;
  if p_recipient_id<>e.elderly_user_id and not private.family_has_user(e.family_id,p_recipient_id) then raise exception 'recipient unavailable' using errcode='42501'; end if;
  if length(coalesce(p_provider_message_id,''))>512 or length(coalesce(p_error_message,''))>200 then raise exception 'notification details too long' using errcode='22023'; end if;
  insert into public.notification_logs(family_id,emergency_event_id,user_id,status,provider_message_id,error_message)
    values(e.family_id,e.id,p_recipient_id,p_status,p_provider_message_id,p_error_message) returning * into l;
  return to_jsonb(l);
end;
$$;
