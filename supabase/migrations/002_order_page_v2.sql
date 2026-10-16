-- ParadiseBlox order page v2
-- Safe to run more than once. Only ADDS columns, tables and indexes, and widens
-- two checks, so the current live site keeps working before and after.

-- ---------------------------------------------------------------- orders
alter table public.orders add column if not exists risk_level text;
alter table public.orders add column if not exists risk_reasons jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists risk_checked_at timestamptz;
alter table public.orders add column if not exists risk_pending boolean not null default false;
alter table public.orders add column if not exists risk_hold boolean not null default false;
alter table public.orders add column if not exists risk_decision text;
alter table public.orders add column if not exists risk_decided_at timestamptz;
alter table public.orders add column if not exists checkout_ip text;
alter table public.orders add column if not exists billing_country text;
alter table public.orders add column if not exists customer_order_count integer;
alter table public.orders add column if not exists consent_at timestamptz;
alter table public.orders add column if not exists received_at timestamptz;
alter table public.orders add column if not exists auto_received boolean not null default false;
alter table public.orders add column if not exists customer_notified_at timestamptz;
alter table public.orders add column if not exists admin_notified_at timestamptz;

do $$ begin
  alter table public.orders drop constraint if exists orders_risk_level_check;
  alter table public.orders add constraint orders_risk_level_check check (risk_level is null or risk_level in ('low','medium','high'));
  alter table public.orders drop constraint if exists orders_risk_decision_check;
  alter table public.orders add constraint orders_risk_decision_check check (risk_decision is null or risk_decision in ('approved','cancelled'));
end $$;

-- 'auto' is new: the order was marked received 24 hours after delivery.
-- Drop whatever check currently limits completed_by, whatever it is named.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%completed_by%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
  alter table public.orders add constraint orders_completed_by_check check (completed_by is null or completed_by in ('customer','admin','auto'));
end $$;

create index if not exists orders_delivered_due_idx on public.orders(delivered_at) where status = 'delivered';
create index if not exists orders_risk_idx on public.orders(risk_level) where risk_level is not null;
create index if not exists orders_roblox_user_idx on public.orders(roblox_user_id) where roblox_user_id is not null;

-- ---------------------------------------------------------------- order items
alter table public.order_items add column if not exists delivery_status text not null default 'pending';
alter table public.order_items add column if not exists delivery_updated_at timestamptz;
do $$ begin
  alter table public.order_items drop constraint if exists order_items_delivery_status_check;
  alter table public.order_items add constraint order_items_delivery_status_check check (delivery_status in ('pending','delivered','missing'));
end $$;
create index if not exists order_items_line_idx on public.order_items(order_id, shopify_line_item_gid);

-- ---------------------------------------------------------------- messages
-- Several screenshots in one message. The old single attachment columns stay
-- for messages sent before this update.
alter table public.messages add column if not exists attachments jsonb not null default '[]'::jsonb;
create index if not exists messages_unread_admin_idx on public.messages(order_id, created_at) where sender = 'admin' and read_by_customer_at is null;
create index if not exists messages_unread_customer_idx on public.messages(order_id, created_at) where sender = 'customer' and read_by_admin_at is null;

-- ---------------------------------------------------------------- evidence log
-- Every important action with time, IP, location and device. Used for the
-- chargeback evidence PDF. Never edited, only added to.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  actor text not null check (actor in ('customer','admin','system')),
  action text not null,
  ip text,
  country text,
  region text,
  city text,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_order_idx on public.audit_events(order_id, created_at);
alter table public.audit_events enable row level security;

-- ---------------------------------------------------------------- phone alerts
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.push_subscriptions enable row level security;

-- ---------------------------------------------------------------- store status
-- Only Online and Offline now. Busy becomes Offline.
update public.store_settings set value = 'offline', updated_at = now() where key = 'store_status' and value = 'busy';
