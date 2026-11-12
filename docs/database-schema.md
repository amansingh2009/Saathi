# Database schema

The live Supabase project has the following public tables, all with RLS enabled:

1. `profiles`
2. `families`
3. `family_members`
4. `invitations`
5. `tasks`
6. `task_logs`
7. `medications`
8. `medication_schedules`
9. `medication_logs`
10. `consent_records`
11. `screen_sessions`
12. `emergency_events`
13. `device_tokens`
14. `notification_logs`

Roles belong to `family_members`, so one person can be an elder in one family and a caregiver in another. Foreign keys, unique family membership, composite family relationships, state constraints, and indexes protect the data shape.

## Security

Policies grant family reads only to active members. Caregiver-only policies protect family administration, invitations, task assignment, medicine schedules, and emergency acknowledgement. Elders can complete their own tasks, create self-assigned tasks, explicitly record their own medicine response, and make emergency requests. Profile select grants expose only `id`, name, phone, and language. Table privileges are granted separately from RLS.

Security-definer functions are used only where a transaction must update more than one table or access another member's registered notification token. Each function fixes its `search_path`, checks `auth.uid()` and family role/ownership, and is granted to `authenticated` only. Supabase's advisor reports these as callable security-definer RPCs by design; they are not unrestricted administrative functions.

Private guidance topics use `realtime.messages` policies keyed to an active `screen_sessions` row. Only the elder can publish frame messages, and only the elder and named caregiver can receive them. `screen_sessions` is also in the Realtime publication so a caregiver ending a session tells the elder client to stop MediaProjection.

## Migrations

- `20261112143043_saathi_initial_schema.sql` creates tables, RPCs, grants, baseline RLS, and Realtime publications.
- `20261112143425_policy_performance_and_indexes.sql` improves policy evaluation, adds foreign-key indexes, and revokes consent at session end.
- `20261112143746_guidance_status_realtime.sql` publishes guidance session state changes.
- `20261112143854_elder_self_assigned_tasks.sql` permits an elder to add a task for themselves while preventing assignment to another member.
- `20261112144547_guidance_end_room_access.sql` keeps the participant-only private channel open long enough for the elder client to receive a caregiver stop action; ended sessions cannot publish frames.
- `20261112145440_remaining_foreign_key_indexes.sql` adds covering indexes for the last two family foreign keys found by the Supabase advisor.

The hosted project has these migrations applied. No demo seed data is installed.
