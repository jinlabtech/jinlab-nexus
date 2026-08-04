-- Automatically create user profile after signup

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin

	insert into public.user_profile (
		user_id,
		email,
		full_name,
		role
	)
	values (
		new.id,
		new.email,
		coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
		'owner'
	);

	return new;

end;
$$;


create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();
