-- Allow an authenticated creator to read the family row returned by INSERT.
-- The membership trigger runs after the row is inserted, so the creator is not
-- yet visible to the membership-only SELECT policy during INSERT ... RETURNING.
alter policy families_member_select on public.families
  using (created_by = (select auth.uid()) or private.is_family_member(id));
