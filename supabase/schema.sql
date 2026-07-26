create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_gid text unique not null,
  shopify_customer_gid text,
  order_number text unique not null,
  email text not null,
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'USD',
  financial_status text not null default 'PAID',
  status text not null default 'paid' check (status in ('paid','in_progress','delivered','completed','cancelled')),
  roblox_user_id bigint,
  roblox_username text,
  roblox_display_name text,
  roblox_avatar_url text,
  claim_token_hash text unique,
  claim_token_expires_at timestamptz,
  claim_link_sent_at timestamptz,
  receipt_token_hash text unique,
  receipt_token_expires_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  completed_by text check (completed_by in ('customer','admin')),
  admin_completion_reason text,
  chat_locked boolean not null default false,
  shopify_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_email_idx on public.orders(lower(email));
create index if not exists orders_status_idx on public.orders(status, updated_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  shopify_line_item_gid text, name text not null, variant_title text, custom_attributes jsonb not null default '[]'::jsonb, quantity integer not null default 1, sku text, image_url text, game text not null default 'Other', created_at timestamptz default now()
);
create index if not exists order_items_order_idx on public.order_items(order_id);

alter table public.order_items add column if not exists variant_title text;
alter table public.order_items add column if not exists custom_attributes jsonb not null default '[]'::jsonb;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  sender text not null check(sender in ('customer','admin','system')), body text not null,
  attachment_path text, attachment_name text, attachment_mime text,
  read_by_customer_at timestamptz, read_by_admin_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists messages_order_created_idx on public.messages(order_id, created_at);

create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  uploaded_by uuid references auth.users(id), note text, file_path text not null, file_name text not null, mime_type text not null, created_at timestamptz not null default now()
);

create table if not exists public.email_codes (
  id uuid primary key default gen_random_uuid(), email text not null, code_hash text not null,
  expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists email_codes_lookup_idx on public.email_codes(lower(email), created_at desc);

create table if not exists public.store_settings (
  key text primary key, value text not null, updated_at timestamptz not null default now()
);
insert into public.store_settings(key,value) values('store_status','offline') on conflict(key) do nothing;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade, display_name text not null default 'ParadiseBlox Admin', created_at timestamptz default now()
);


create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(), action text not null, key_hash text not null, created_at timestamptz not null default now()
);
create index if not exists request_events_lookup_idx on public.request_events(action,key_hash,created_at desc);

create table if not exists public.email_receipts (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  receipt_type text not null, status text not null, provider_id text, error text, created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(), webhook_id text unique not null, topic text not null, created_at timestamptz default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.messages enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.email_codes enable row level security;
alter table public.store_settings enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.webhook_events enable row level security;
alter table public.request_events enable row level security;
alter table public.email_receipts enable row level security;
-- No public table policies are intentionally created. All customer access goes through authorised server routes.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('chat-attachments','chat-attachments',false,8388608,array['image/png','image/jpeg','image/webp','image/gif','video/mp4'])
on conflict (id) do update set public=false;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('delivery-proofs','delivery-proofs',false,8388608,array['image/png','image/jpeg','image/webp','video/mp4'])
on conflict (id) do update set public=false;
