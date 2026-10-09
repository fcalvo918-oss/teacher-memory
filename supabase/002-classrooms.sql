-- Run once AFTER the original Teacher Memory schema.
-- This transaction preserves every existing observation and its student ID.
begin;

create table public.tm_classrooms (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default gen_random_uuid()::text check (length(id) between 1 and 100),
  name text not null check (length(name) <= 80 and length(btrim(name)) > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create unique index tm_classrooms_name_idx on public.tm_classrooms (owner_id, lower(btrim(name)));

create table public.tm_students (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default gen_random_uuid()::text check (length(id) between 1 and 100),
  classroom_id text not null,
  alias text not null check (length(alias) <= 32 and length(btrim(alias)) > 0),
  color text not null default 'green' check (color in ('peach', 'blue', 'lavender', 'green')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (owner_id, id),
  constraint tm_students_classroom_owner_fk foreign key (owner_id, classroom_id)
    references public.tm_classrooms(owner_id, id)
);
create unique index tm_students_alias_idx on public.tm_students (owner_id, classroom_id, lower(btrim(alias)));

-- Backfill all existing accounts. Fixed student IDs stay unchanged, so old notes
-- attach to the same aliases in the Starter classroom.
insert into public.tm_classrooms(owner_id, id, name)
  select id, 'starter', 'Starter classroom' from auth.users;
insert into public.tm_students(owner_id, id, classroom_id, alias, color)
  select u.id, v.id, 'starter', v.alias, v.color
  from auth.users u cross join (values
    ('am', 'A.M.', 'peach'), ('bk', 'B.K.', 'blue'), ('cr', 'C.R.', 'lavender'),
    ('ds', 'D.S.', 'green'), ('el', 'E.L.', 'peach'), ('fn', 'F.N.', 'blue')
  ) as v(id, alias, color);

alter table public.tm_observations drop constraint tm_observations_student_id_check;
alter table public.tm_observations add constraint tm_observations_student_owner_fk
  foreign key (owner_id, student_id) references public.tm_students(owner_id, id);

alter table public.tm_classrooms enable row level security;
alter table public.tm_classrooms force row level security;
alter table public.tm_students enable row level security;
alter table public.tm_students force row level security;
revoke all on public.tm_classrooms, public.tm_students from anon, authenticated;
grant select, insert on public.tm_classrooms, public.tm_students to authenticated;
grant update (name, archived) on public.tm_classrooms to authenticated;
grant update (alias, color, archived) on public.tm_students to authenticated;

create policy "Read own classrooms" on public.tm_classrooms
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Create own classrooms" on public.tm_classrooms
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Update own classrooms" on public.tm_classrooms
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Read own students" on public.tm_students
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Create own students in active classroom" on public.tm_students
  for insert to authenticated with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.tm_classrooms c
      where c.owner_id = tm_students.owner_id and c.id = tm_students.classroom_id and not c.archived
    )
  );
create policy "Update own students" on public.tm_students
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Keep history readable, but prevent new observations for archived students/classes.
drop policy "Insert own observations" on public.tm_observations;
drop policy "Update own observations" on public.tm_observations;
create policy "Insert own active student observations" on public.tm_observations
  for insert to authenticated with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.tm_students s join public.tm_classrooms c
        on c.owner_id = s.owner_id and c.id = s.classroom_id
      where s.owner_id = tm_observations.owner_id and s.id = tm_observations.student_id
        and not s.archived and not c.archived
    )
  );
create policy "Update own active student observations" on public.tm_observations
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.tm_students s join public.tm_classrooms c
        on c.owner_id = s.owner_id and c.id = s.classroom_id
      where s.owner_id = tm_observations.owner_id and s.id = tm_observations.student_id
        and not s.archived and not c.archived
    )
  );

-- New accounts get the same starter roster on first use. This function uses
-- the caller's permissions and RLS; it cannot act as another account.
create function public.tm_ensure_starter() returns void
language plpgsql security invoker set search_path = '' as $$
declare account_id uuid := auth.uid();
begin
  if account_id is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if exists (select 1 from public.tm_classrooms where owner_id = account_id and id = 'starter') then return; end if;
  insert into public.tm_classrooms(owner_id, id, name)
    values (account_id, 'starter', 'Starter classroom') on conflict (owner_id, id) do nothing;
  insert into public.tm_students(owner_id, id, classroom_id, alias, color)
    select account_id, v.id, 'starter', v.alias, v.color from (values
      ('am', 'A.M.', 'peach'), ('bk', 'B.K.', 'blue'), ('cr', 'C.R.', 'lavender'),
      ('ds', 'D.S.', 'green'), ('el', 'E.L.', 'peach'), ('fn', 'F.N.', 'blue')
    ) as v(id, alias, color) on conflict (owner_id, id) do nothing;
end $$;
revoke all on function public.tm_ensure_starter() from public, anon;
grant execute on function public.tm_ensure_starter() to authenticated;

commit;
