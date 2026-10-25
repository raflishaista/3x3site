begin;
with names as (
  select user_id, coalesce(nullif(trim(both '-' from regexp_replace(lower(profile->>'name'), '[^a-z0-9_-]+', '-', 'g')), ''), 'user') as base
  from public.three_by_three_profiles where profile->>'username' is null
), ranked as (
  select *, row_number() over (partition by base order by user_id) as n from names
)
update public.three_by_three_profiles p
set profile = jsonb_set(p.profile, '{username}', to_jsonb(
  case when r.n > 1 or r.base in ('login','register','edit','collection','api','assets','vendor')
    then left(r.base,30) || '-' || left(r.user_id::text,8)
    else left(r.base,40) end))
from ranked r where p.user_id = r.user_id;
create unique index if not exists three_by_three_username_unique
  on public.three_by_three_profiles (lower(profile->>'username'));
notify pgrst, 'reload schema';
commit;
