-- Run after 002-classrooms.sql. All fixtures roll back; no real accounts change.
begin;
insert into auth.users(id, email) values
 ('ca550001-0000-4000-8000-000000000001', 'classroom-check-a@example.invalid'),
 ('ca550001-0000-4000-8000-000000000002', 'classroom-check-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ca550001-0000-4000-8000-000000000001', true);
select public.tm_ensure_starter();
select public.tm_ensure_starter();
do $$ begin
 if (select count(*) from public.tm_students) <> 6 then raise exception 'Starter roster not idempotent'; end if;
end $$;
insert into public.tm_classrooms(id,name) values ('check-class','Fictional check');
insert into public.tm_students(id,classroom_id,alias) values ('check-student','check-class','Z.Z.');
insert into public.tm_observations(id,student_id,observed_on,category,note)
 values ('check-note','check-student',current_date,'Learning','Fictional policy check');
update public.tm_students set alias='Renamed alias' where id='check-student';
do $$ begin
 if (select count(*) from public.tm_observations where id='check-note') <> 1 then raise exception 'Renaming lost timeline'; end if;
 begin
  delete from public.tm_students where id='check-student';
  raise exception 'Roster deletion was allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.tm_students set owner_id='ca550001-0000-4000-8000-000000000002' where id='check-student';
  raise exception 'Ownership changes were allowed';
 exception when insufficient_privilege then null; end;
end $$;

update public.tm_students set archived=true where id='check-student';
do $$ begin
 if (select count(*) from public.tm_observations where id='check-note') <> 1 then raise exception 'Archive hid history'; end if;
 begin
  insert into public.tm_observations(id,student_id,observed_on,category,note)
   values ('blocked-student','check-student',current_date,'Learning','Must fail');
  raise exception 'Archived student accepted notes';
 exception when insufficient_privilege then null; end;
 begin
  update public.tm_observations set note='Must fail' where id='check-note';
  raise exception 'Archived note update allowed';
 exception when insufficient_privilege then null; end;
end $$;
update public.tm_students set archived=false where id='check-student';
update public.tm_observations set note='Restored student accepts updates' where id='check-note';
update public.tm_classrooms set archived=true where id='check-class';
do $$ begin
 begin
  insert into public.tm_observations(id,student_id,observed_on,category,note)
   values ('blocked-class','check-student',current_date,'Learning','Must fail');
  raise exception 'Archived classroom accepted notes';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.tm_students(id,classroom_id,alias) values ('blocked-alias','check-class','Blocked');
  raise exception 'Archived classroom accepted students';
 exception when insufficient_privilege then null; end;
end $$;
update public.tm_classrooms set archived=false where id='check-class';
insert into public.tm_observations(id,student_id,observed_on,category,note)
 values ('restored-note','check-student',current_date,'Learning','Restored classroom');

select set_config('request.jwt.claim.sub', 'ca550001-0000-4000-8000-000000000002', true);
select public.tm_ensure_starter();
do $$ declare affected integer; begin
 if exists(select 1 from public.tm_classrooms where id='check-class') then raise exception 'Other account saw classroom'; end if;
 if exists(select 1 from public.tm_students where id='check-student') then raise exception 'Other account saw student'; end if;
 if exists(select 1 from public.tm_observations where id='check-note') then raise exception 'Other account saw note'; end if;
 update public.tm_classrooms set name='Must fail' where id='check-class';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Other account changed classroom'; end if;
 update public.tm_students set alias='Must fail' where id='check-student';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Other account changed student'; end if;
 delete from public.tm_observations where id='check-note';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Other account deleted note'; end if;
 begin
  insert into public.tm_classrooms(owner_id,id,name)
   values ('ca550001-0000-4000-8000-000000000001','spoof','Must fail');
  raise exception 'Spoofed ownership allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.tm_students(id,classroom_id,alias) values ('foreign-parent','check-class','Must fail');
  raise exception 'Foreign classroom accepted student';
 exception when insufficient_privilege or foreign_key_violation then null; end;
 begin
  insert into public.tm_observations(id,student_id,observed_on,category,note)
   values ('foreign-student','check-student',current_date,'Learning','Must fail');
  raise exception 'Foreign student accepted note';
 exception when insufficient_privilege or foreign_key_violation then null; end;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
 begin
  perform 1 from public.tm_classrooms;
  raise exception 'Anonymous classroom access allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from public.tm_students;
  raise exception 'Anonymous student access allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from public.tm_observations;
  raise exception 'Anonymous observation access allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.tm_ensure_starter();
  raise exception 'Anonymous starter creation allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: classroom ownership, archive rules, and anonymous restrictions' as result;
