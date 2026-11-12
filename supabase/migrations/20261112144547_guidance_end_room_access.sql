alter policy guidance_participant_receive on realtime.messages
  using (exists (
    select 1 from public.screen_sessions s
    where realtime.topic()='guidance:' || s.id::text and s.status in ('active','ended','declined')
      and (s.elderly_user_id=(select auth.uid()) or s.caregiver_user_id=(select auth.uid()))
  ));
