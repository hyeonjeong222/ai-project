create table public.chat_rate_limit_buckets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_times timestamptz[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.chat_rate_limit_buckets enable row level security;

create or replace function public.consume_chat_rate_limit(
  p_workspace_id uuid,
  p_user_id uuid,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  timestamps timestamptz[];
  cutoff timestamptz;
  oldest timestamptz;
  retry_after integer;
begin
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit configuration';
  end if;

  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id
  ) then
    raise exception 'Workspace access denied';
  end if;

  insert into public.chat_rate_limit_buckets (workspace_id, user_id)
  values (p_workspace_id, p_user_id)
  on conflict (workspace_id, user_id) do nothing;

  select request_times into timestamps
  from public.chat_rate_limit_buckets
  where workspace_id = p_workspace_id and user_id = p_user_id
  for update;

  cutoff := clock_timestamp() - make_interval(secs => p_window_seconds);
  select coalesce(array_agg(item order by item), '{}'::timestamptz[])
  into timestamps
  from unnest(timestamps) as item
  where item > cutoff;

  if cardinality(timestamps) >= p_limit then
    oldest := timestamps[1];
    retry_after := greatest(
      1,
      ceil(extract(epoch from (oldest + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer
    );
    update public.chat_rate_limit_buckets
    set request_times = timestamps, updated_at = clock_timestamp()
    where workspace_id = p_workspace_id and user_id = p_user_id;
    return query select false, retry_after;
    return;
  end if;

  timestamps := array_append(timestamps, clock_timestamp());
  update public.chat_rate_limit_buckets
  set request_times = timestamps, updated_at = clock_timestamp()
  where workspace_id = p_workspace_id and user_id = p_user_id;
  return query select true, 0;
end;
$$;

revoke all on table public.chat_rate_limit_buckets from public, anon, authenticated;
revoke all on function public.consume_chat_rate_limit(uuid, uuid, integer, integer) from public;
grant execute on function public.consume_chat_rate_limit(uuid, uuid, integer, integer) to service_role;
