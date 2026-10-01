create or replace function public.compact_jinlab_standard_invoice_copy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id = '0502a2e2-c0b6-414c-9ac0-ed8d3c6c9b4c'::uuid
     and coalesce(new.notes,'') ilike 'Warranty & Returns%'
     and coalesce(new.terms,'') ilike '%Proof of purchase%'
  then
    new.notes := null;
    new.terms := 'Proof of purchase required. Warranty, returns and repairs are handled under the Consumer Protection Act and applicable manufacturer terms. Accidental, liquid or physical damage is excluded unless otherwise required by law; back up data before repairs.';
  end if;
  return new;
end;
$$;

drop trigger if exists compact_jinlab_standard_invoice_copy_trigger on public.invoice;
create trigger compact_jinlab_standard_invoice_copy_trigger
before insert or update of notes, terms on public.invoice
for each row
execute function public.compact_jinlab_standard_invoice_copy();

update public.branch
set branch_name = 'Head Office'
where id='e6a8286c-0f3c-4d8e-aed7-cc1d856ad327'::uuid
  and company_id='0502a2e2-c0b6-414c-9ac0-ed8d3c6c9b4c'::uuid;;
