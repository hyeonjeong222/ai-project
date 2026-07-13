-- SaaS company onboarding: a first-time user can create one company
-- workspace, then company administrators invite employees into it.

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  role text not null check (role in ('ADMIN', 'MEMBER')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  token uuid not null default gen_random_uuid() unique,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workspace_invites_open_email_idx
  on public.workspace_invites (workspace_id, lower(email))
  where accepted_at is null;
create index workspace_invites_email_idx
  on public.workspace_invites (lower(email), accepted_at);

create trigger workspace_invites_set_updated_at
before update on public.workspace_invites
for each row execute function private.set_updated_at();

alter table public.workspace_invites enable row level security;
-- Invitations are API-only to avoid disclosing company membership by email.
