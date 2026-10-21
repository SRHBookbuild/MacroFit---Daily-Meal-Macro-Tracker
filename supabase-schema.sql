-- Run in Supabase SQL Editor. This table stores one journal per authenticated account.
create table if not exists public.macrofit_journals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  journal jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.macrofit_journals enable row level security;
revoke all on public.macrofit_journals from anon;
grant select, insert, update on public.macrofit_journals to authenticated;
create policy "Owners can read journals" on public.macrofit_journals for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners can create journals" on public.macrofit_journals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners can update journals" on public.macrofit_journals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
