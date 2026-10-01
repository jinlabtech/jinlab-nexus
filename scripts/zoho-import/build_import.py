import csv, json, os
from collections import OrderedDict

ROOT=os.getcwd()
DATA=os.path.join(ROOT,"scripts","zoho-import","data")
OUT=os.path.join(ROOT,"scripts","zoho-import","generated-import.sql")
COMP="0502a2e2-c0b6-414c-9ac0-ed8d3c6c9b4c"
BRANCH="e6a8286c-0f3c-4d8e-aed7-cc1d856ad327"
ORG="894506948"
ZOHO_BRANCH="6745755000000093105"

def rows(name):
    with open(os.path.join(DATA,name),encoding="utf-8-sig",newline="") as f:
        return list(csv.DictReader(f))

def s(v): return (v or "").strip()
def n(v):
    x=s(v).replace(",","")
    if len(x)>=3 and x[:3].isalpha(): x=x[3:].strip()
    try: return float(x or 0)
    except: return 0.0
def i(v):
    try: return max(0,int(float(s(v) or 0)))
    except: return 0
def null(v):
    x=s(v)
    return x or None
def phone(*vals):
    for v in vals:
        x=s(v)
        if x: return x.lstrip("'")
    return None
def dollar(data):
    text=json.dumps(data,ensure_ascii=False,separators=(",",":"))
    if "$zoho$" in text: raise RuntimeError("Unexpected delimiter in source data")
    return "$zoho$"+text+"$zoho$"

contacts=rows("Contacts.csv")
items=rows("Item.csv")
invoice_rows=rows("Invoice.csv")
payments=rows("Customer_Payment.csv")

customers=[]
for idx,r in enumerate(contacts,1):
    notes=[]
    if s(r.get("Notes")): notes.append(s(r["Notes"]))
    if s(r.get("Company Name")): notes.append("Zoho company: "+s(r["Company Name"]))
    person=" ".join(x for x in [s(r.get("First Name")),s(r.get("Last Name"))] if x) or None
    code=null(r.get("Billing Code")) or null(r.get("Shipping Code"))
    if code and code.endswith(".0") and code[:-2].isdigit(): code=code[:-2]
    customers.append({
      "external_id":s(r["Customer ID"]),
      "customer_number":f"CUS-ZOHO-{idx:05d}",
      "customer_type":"business" if s(r.get("Customer Sub Type")).lower()=="business" else "individual",
      "customer_name":null(r.get("Customer Name")) or null(r.get("Display Name")) or ("Zoho Customer "+s(r["Customer ID"])[-6:]),
      "contact_person":person,
      "email":null(r.get("EmailID")),
      "phone":phone(r.get("Phone"),r.get("MobilePhone"),r.get("Billing Phone"),r.get("Shipping Phone")),
      "address_line_1":null(r.get("Billing Address")) or null(r.get("Shipping Address")),
      "address_line_2":null(r.get("Billing Street2")) or null(r.get("Shipping Street2")),
      "city":null(r.get("Billing City")) or null(r.get("Shipping City")),
      "province":null(r.get("Billing State")) or null(r.get("Shipping State")),
      "postal_code":code,
      "country":null(r.get("Billing Country")) or null(r.get("Shipping Country")) or "South Africa",
      "payment_terms_days":i(r.get("Payment Terms")),
      "notes":" | ".join(notes) if notes else None,
      "is_active":s(r.get("Status")).lower()!="inactive",
      "created_time":null(r.get("Created Time"))
    })

item_by_name={}
itemdata=[]
for r in items:
    ext=s(r["Item ID"])
    sku=null(r.get("SKU")) or ("ZOHO-"+ext[-10:])
    item_by_name[s(r["Item Name"])]=ext
    itemdata.append({
      "external_id":ext,"item_name":null(r.get("Item Name")) or ("Zoho Item "+ext[-6:]),
      "sku":sku,"description":null(r.get("Description")),"selling_price":n(r.get("Rate")),
      "is_active":s(r.get("Status")).lower()!="inactive",
      "product_type":null(r.get("Product Type")),"usage_unit":null(r.get("Usage unit")),
      "original_sku":null(r.get("SKU"))
    })

groups=OrderedDict()
for r in invoice_rows:
    ext=s(r["Invoice ID"])
    groups.setdefault(ext,[]).append(r)

contact_ids={x["external_id"] for x in customers}
invoices=[]
lines=[]
invoice_no_to_ext={}
for ext,rs in groups.items():
    r=rs[0]
    cust=s(r["Customer ID"])
    if cust not in contact_ids: raise RuntimeError(f"Missing customer {cust}")
    zs=s(r["Invoice Status"])
    status="draft" if zs=="Draft" else ("overdue" if zs=="Overdue" else "issued")
    num=s(r["Invoice Number"])
    invoice_no_to_ext[num]=ext
    invoices.append({
      "external_id":ext,"customer_external_id":cust,"invoice_number":num,
      "status":status,"zoho_status":zs,"invoice_date":s(r["Invoice Date"]),
      "due_date":null(r.get("Due Date")),"customer_reference":null(r.get("PurchaseOrder")),
      "notes":null(r.get("Notes")),"terms":null(r.get("Terms & Conditions")),
      "zoho_total":n(r.get("Total")),"zoho_balance":n(r.get("Balance"))
    })
    for pos,x in enumerate(rs,1):
        name=null(x.get("Item Name"))
        lines.append({
          "external_id":f"{ext}:{pos}","invoice_external_id":ext,
          "inventory_external_id":item_by_name.get(name) if name else None,
          "description":null(x.get("Item Desc")) or name or "Imported Zoho line item",
          "quantity":n(x.get("Quantity")) or 1,"unit_price":n(x.get("Item Price")),
          "discount_value":n(x.get("Discount Amount")),"source_item_name":name,
          "source_sku":null(x.get("SKU"))
        })

modes={"Cash":"cash","Bank Transfer":"eft","Credit Card":"card","Bank Remittance":"eft","Mobile Money":"other"}
paymentdata=[]
for r in payments:
    invno=s(r["Invoice Number"])
    if invno not in invoice_no_to_ext: raise RuntimeError(f"Missing invoice {invno}")
    cust=s(r["CustomerID"])
    if cust not in contact_ids: raise RuntimeError(f"Missing customer {cust}")
    paymentdata.append({
      "invoice_payment_external_id":s(r["InvoicePayment ID"]),
      "customer_payment_external_id":s(r["CustomerPayment ID"]),
      "invoice_external_id":invoice_no_to_ext[invno],"invoice_number":invno,
      "customer_external_id":cust,"payment_date":s(r["Date"]),
      "payment_method":modes.get(s(r["Mode"]),"other"),"source_mode":s(r["Mode"]),
      "reference":null(r.get("Reference Number")) or ("ZOHO-PAY-"+s(r.get("Payment Number"))),
      "applied_amount":n(r.get("Amount Applied to Invoice")),"original_amount":n(r.get("Amount")),
      "unused_amount":n(r.get("Unused Amount")),"description":null(r.get("Description"))
    })
paymentdata.sort(key=lambda x:(x["payment_date"],x["invoice_payment_external_id"]))

invoice_total=sum(x["zoho_total"] for x in invoices)
balance=sum(x["zoho_balance"] for x in invoices)
applied=sum(x["applied_amount"] for x in paymentdata)
unused=sum(x["unused_amount"] for x in paymentdata)
if abs((invoice_total-balance)-applied)>0.009: raise RuntimeError("Invoice/payment reconciliation failed")
unmatched=sum(1 for x in lines if not x["inventory_external_id"])

sql=f"""begin;
create or replace function pg_temp.zu(k text,e text) returns uuid language sql immutable as $$
select (substr(md5('jinlab-nexus:zoho_invoice:'||k||':'||e),1,8)||'-'||substr(md5('jinlab-nexus:zoho_invoice:'||k||':'||e),9,4)||'-'||substr(md5('jinlab-nexus:zoho_invoice:'||k||':'||e),13,4)||'-'||substr(md5('jinlab-nexus:zoho_invoice:'||k||':'||e),17,4)||'-'||substr(md5('jinlab-nexus:zoho_invoice:'||k||':'||e),21,12))::uuid $$;

do $$ begin
if not exists(select 1 from public.company where id='{COMP}'::uuid and company_name='JINLAB') then raise exception 'JINLAB target company missing'; end if;
if not exists(select 1 from public.branch where id='{BRANCH}'::uuid and company_id='{COMP}'::uuid) then raise exception 'JINLAB target branch missing'; end if;
end $$;

insert into public.external_migration_reference(company_id,source_system,entity_type,external_id,nexus_id,metadata) values
('{COMP}','zoho_invoice','organisation','{ORG}','{COMP}','{{"nexus_company_name":"JINLAB"}}'::jsonb),
('{COMP}','zoho_invoice','branch','{ZOHO_BRANCH}','{BRANCH}','{{"zoho_branch_name":"Head Office"}}'::jsonb)
on conflict(company_id,source_system,entity_type,external_id) do nothing;

create temporary table _z_setting as select automatic_payment_posting from public.company_accounting_settings where company_id='{COMP}';
update public.company_accounting_settings set automatic_payment_posting=false where company_id='{COMP}';

with s as (select * from jsonb_to_recordset({dollar(customers)}::jsonb) as x(
external_id text,customer_number text,customer_type text,customer_name text,contact_person text,email text,phone text,address_line_1 text,address_line_2 text,city text,province text,postal_code text,country text,payment_terms_days int,notes text,is_active boolean,created_time text))
insert into public.customer(id,company_id,customer_number,customer_type,customer_name,contact_person,email,phone,address_line_1,address_line_2,city,province,postal_code,country,payment_terms_days,notes,is_active,created_at,updated_at)
select pg_temp.zu('customer',external_id),'{COMP}',customer_number,customer_type,customer_name,contact_person,email,phone,address_line_1,address_line_2,city,province,postal_code,country,payment_terms_days,notes,is_active,
case when created_time is null then now() else created_time::timestamp at time zone 'Africa/Johannesburg' end,
case when created_time is null then now() else created_time::timestamp at time zone 'Africa/Johannesburg' end from s
on conflict(company_id,customer_number) do nothing;

with s as (select * from jsonb_to_recordset({dollar(customers)}::jsonb) as x(external_id text,customer_number text,customer_type text,customer_name text,contact_person text,email text,phone text,address_line_1 text,address_line_2 text,city text,province text,postal_code text,country text,payment_terms_days int,notes text,is_active boolean,created_time text))
insert into public.external_migration_reference(company_id,source_system,entity_type,external_id,nexus_id,metadata)
select '{COMP}','zoho_invoice','customer',external_id,pg_temp.zu('customer',external_id),jsonb_build_object('customer_number',customer_number,'customer_name',customer_name) from s
on conflict(company_id,source_system,entity_type,external_id) do nothing;

with s as (select * from jsonb_to_recordset({dollar(itemdata)}::jsonb) as x(external_id text,item_name text,sku text,description text,selling_price numeric,is_active boolean,product_type text,usage_unit text,original_sku text))
insert into public.inventory_item(id,company_id,item_name,sku,description,cost_price,selling_price,minimum_stock,is_active)
select pg_temp.zu('item',external_id),'{COMP}',item_name,sku,description,0,selling_price,0,is_active from s on conflict(company_id,sku) do nothing;

with s as (select * from jsonb_to_recordset({dollar(itemdata)}::jsonb) as x(external_id text,item_name text,sku text,description text,selling_price numeric,is_active boolean,product_type text,usage_unit text,original_sku text))
insert into public.external_migration_reference(company_id,source_system,entity_type,external_id,nexus_id,metadata)
select '{COMP}','zoho_invoice','item',external_id,pg_temp.zu('item',external_id),jsonb_build_object('item_name',item_name,'sku',sku,'original_sku',original_sku,'product_type',product_type,'usage_unit',usage_unit) from s
on conflict(company_id,source_system,entity_type,external_id) do nothing;

with s as (select * from jsonb_to_recordset({dollar(invoices)}::jsonb) as x(external_id text,customer_external_id text,invoice_number text,status text,zoho_status text,invoice_date date,due_date date,customer_reference text,notes text,terms text,zoho_total numeric,zoho_balance numeric))
insert into public.invoice(id,company_id,branch_id,customer_id,invoice_number,status,invoice_date,due_date,customer_reference,notes,terms,subtotal,discount_amount,tax_amount,total_amount,amount_paid,balance_due)
select pg_temp.zu('invoice',external_id),'{COMP}','{BRANCH}',pg_temp.zu('customer',customer_external_id),invoice_number,status,invoice_date,due_date,customer_reference,notes,terms,0,0,0,0,0,0 from s
on conflict(company_id,invoice_number) do nothing;

with s as (select * from jsonb_to_recordset({dollar(invoices)}::jsonb) as x(external_id text,customer_external_id text,invoice_number text,status text,zoho_status text,invoice_date date,due_date date,customer_reference text,notes text,terms text,zoho_total numeric,zoho_balance numeric))
insert into public.external_migration_reference(company_id,source_system,entity_type,external_id,nexus_id,metadata)
select '{COMP}','zoho_invoice','invoice',external_id,pg_temp.zu('invoice',external_id),jsonb_build_object('invoice_number',invoice_number,'zoho_status',zoho_status,'zoho_total',zoho_total,'zoho_balance',zoho_balance) from s
on conflict(company_id,source_system,entity_type,external_id) do nothing;

with s as (select * from jsonb_to_recordset({dollar(lines)}::jsonb) as x(external_id text,invoice_external_id text,inventory_external_id text,description text,quantity numeric,unit_price numeric,discount_value numeric,source_item_name text,source_sku text))
insert into public.invoice_item(id,invoice_id,company_id,inventory_item_id,description,quantity,unit_price,discount_mode,discount_value,tax_mode,tax_rate,line_subtotal,line_discount,line_tax,line_total)
select pg_temp.zu('invoice_line',external_id),pg_temp.zu('invoice',invoice_external_id),'{COMP}',case when inventory_external_id is null then null else pg_temp.zu('item',inventory_external_id) end,description,quantity,unit_price,'fixed',discount_value,'none',0,0,0,0,0 from s
on conflict(id) do nothing;

with s as (select * from jsonb_to_recordset({dollar(lines)}::jsonb) as x(external_id text,invoice_external_id text,inventory_external_id text,description text,quantity numeric,unit_price numeric,discount_value numeric,source_item_name text,source_sku text))
insert into public.external_migration_reference(company_id,source_system,entity_type,external_id,nexus_id,metadata)
select '{COMP}','zoho_invoice','invoice_line',external_id,pg_temp.zu('invoice_line',external_id),jsonb_build_object('source_item_name',source_item_name,'source_sku',source_sku,'inventory_matched',inventory_external_id is not null) from s
on conflict(company_id,source_system,entity_type,external_id) do nothing;

with s as (select * from jsonb_to_recordset({dollar(paymentdata)}::jsonb) as x(invoice_payment_external_id text,customer_payment_external_id text,invoice_external_id text,invoice_number text,customer_external_id text,payment_date date,payment_method text,source_mode text,reference text,applied_amount numeric,original_amount numeric,unused_amount numeric,description text))
insert into public.invoice_payment(id,company_id,branch_id,invoice_id,customer_id,payment_date,payment_method,reference,amount,notes,payment_source)
select pg_temp.zu('invoice_payment',invoice_payment_external_id),'{COMP}','{BRANCH}',pg_temp.zu('invoice',invoice_external_id),pg_temp.zu('customer',customer_external_id),payment_date,payment_method,reference,applied_amount,description,'manual' from s where applied_amount>0
on conflict(id) do nothing;

with s as (select * from jsonb_to_recordset({dollar(paymentdata)}::jsonb) as x(invoice_payment_external_id text,customer_payment_external_id text,invoice_external_id text,invoice_number text,customer_external_id text,payment_date date,payment_method text,source_mode text,reference text,applied_amount numeric,original_amount numeric,unused_amount numeric,description text))
insert into public.external_migration_reference(company_id,source_system,entity_type,external_id,nexus_id,metadata)
select '{COMP}','zoho_invoice','invoice_payment',invoice_payment_external_id,pg_temp.zu('invoice_payment',invoice_payment_external_id),jsonb_build_object('invoice_number',invoice_number,'source_mode',source_mode,'applied_amount',applied_amount,'customer_payment_external_id',customer_payment_external_id) from s
on conflict(company_id,source_system,entity_type,external_id) do nothing;

with s as (select * from jsonb_to_recordset({dollar(paymentdata)}::jsonb) as x(invoice_payment_external_id text,customer_payment_external_id text,invoice_external_id text,invoice_number text,customer_external_id text,payment_date date,payment_method text,source_mode text,reference text,applied_amount numeric,original_amount numeric,unused_amount numeric,description text))
insert into public.external_migration_reference(company_id,source_system,entity_type,external_id,nexus_id,metadata)
select '{COMP}','zoho_invoice','customer_payment',customer_payment_external_id,pg_temp.zu('invoice_payment',invoice_payment_external_id),jsonb_build_object('invoice_number',invoice_number,'source_mode',source_mode,'original_amount',original_amount,'applied_amount',applied_amount,'unused_amount',unused_amount,'customer_external_id',customer_external_id) from s
on conflict(company_id,source_system,entity_type,external_id) do nothing;

update public.company_accounting_settings c set automatic_payment_posting=s.automatic_payment_posting from _z_setting s where c.company_id='{COMP}';

do $$ declare a numeric;b numeric;c numeric; begin
select coalesce(sum(total_amount),0),coalesce(sum(amount_paid),0),coalesce(sum(balance_due),0) into a,b,c from public.invoice where company_id='{COMP}' and id in(select nexus_id from public.external_migration_reference where company_id='{COMP}' and source_system='zoho_invoice' and entity_type='invoice');
if abs(a-{invoice_total:.2f})>.009 then raise exception 'Invoice total mismatch expected {invoice_total:.2f} got %',a; end if;
if abs(b-{applied:.2f})>.009 then raise exception 'Paid total mismatch expected {applied:.2f} got %',b; end if;
if abs(c-{balance:.2f})>.009 then raise exception 'Balance mismatch expected {balance:.2f} got %',c; end if;
end $$;
commit;
"""
os.makedirs(os.path.dirname(OUT),exist_ok=True)
open(OUT,"w",encoding="utf-8").write(sql)
print("Generated:",OUT)
print("Customers:",len(customers))
print("Items:",len(itemdata))
print("Invoices:",len(invoices))
print("Invoice lines:",len(lines))
print("Payments:",len(paymentdata))
print("Unmatched item lines:",unmatched)
print(f"Invoice total: R {invoice_total:.2f}")
print(f"Applied payments: R {applied:.2f}")
print(f"Outstanding: R {balance:.2f}")
print(f"Unused customer credit: R {unused:.2f}")
print("Reconciliation: PASS")
