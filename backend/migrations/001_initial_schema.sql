-- =============================================================================
-- SACPulse Migration 001: Initial Relational Schema, Constraints, Indexes & RLS
-- Target: PostgreSQL 15+ / Supabase
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. users: Institutional Students, Counter Guards, and Administrators
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null check (role in ('STUDENT', 'GUARD', 'ADMIN')),
  roll_no text unique,
  mobile_no text check (mobile_no is null or mobile_no ~ '^[6-9][0-9]{9}$'),
  is_defaulter boolean not null default false,
  penalty_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_role on public.users (role);
create index if not exists idx_users_defaulter on public.users (is_defaulter) where is_defaulter = true;

-- -----------------------------------------------------------------------------
-- 2. sac_items: Multi-Unit Sports Equipment & Singleton Activity Room Keys
-- -----------------------------------------------------------------------------
create table if not exists public.sac_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  item_type text not null check (item_type in ('EQUIPMENT', 'ROOM_KEY')),
  total_qty integer not null check (total_qty >= 0),
  available_qty integer not null check (available_qty >= 0),
  damaged_qty integer not null default 0 check (damaged_qty >= 0),
  occupied_since timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint chk_sac_items_stock_balance check (available_qty + damaged_qty <= total_qty),
  constraint chk_sac_items_room_singleton check (item_type <> 'ROOM_KEY' or total_qty = 1)
);

create index if not exists idx_sac_items_active_catalog
  on public.sac_items (category, name)
  where is_archived = false;

-- -----------------------------------------------------------------------------
-- 3. issue_requests: 2-Minute Walk-Up Checkout Bundles
-- -----------------------------------------------------------------------------
create table if not exists public.issue_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users (id) on delete cascade,
  requested_items jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'TIMED_OUT')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_by_id uuid references public.users (id) on delete set null,
  constraint chk_issue_requests_ttl_window check (expires_at > created_at)
);

create index if not exists idx_issue_requests_pending_queue
  on public.issue_requests (created_at asc)
  where status = 'PENDING';

create index if not exists idx_issue_requests_student_timeouts
  on public.issue_requests (student_id, expires_at desc)
  where status = 'TIMED_OUT';

create index if not exists idx_issue_requests_approved_by
  on public.issue_requests (approved_by_id);

-- -----------------------------------------------------------------------------
-- 4. register_logs: Per-Unit Physical Ledger Sharing Checkout `batch_id`
-- -----------------------------------------------------------------------------
create table if not exists public.register_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  student_id uuid not null references public.users (id) on delete restrict,
  item_id uuid not null references public.sac_items (id) on delete restrict,
  arrival_time timestamptz not null default now(),
  departure_time timestamptz,
  status text not null default 'ISSUED' check (
    status in (
      'ISSUED',
      'ISSUED_TRANSFER_PENDING',
      'RETURNED',
      'RETURNED_VIA_TRANSFER',
      'DAMAGED'
    )
  ),
  pending_transfer_to_id uuid references public.users (id) on delete set null,
  constraint chk_register_logs_transfer_target check (
    (status = 'ISSUED_TRANSFER_PENDING' and pending_transfer_to_id is not null)
    or (status <> 'ISSUED_TRANSFER_PENDING' and pending_transfer_to_id is null)
  )
);

create index if not exists idx_register_logs_batch_id
  on public.register_logs (batch_id);

create index if not exists idx_register_logs_active_holdings
  on public.register_logs (student_id, arrival_time desc)
  where status in ('ISSUED', 'ISSUED_TRANSFER_PENDING');

create index if not exists idx_register_logs_active_items
  on public.register_logs (item_id)
  where status in ('ISSUED', 'ISSUED_TRANSFER_PENDING');

create index if not exists idx_register_logs_incoming_transfers
  on public.register_logs (pending_transfer_to_id)
  where status = 'ISSUED_TRANSFER_PENDING';

create index if not exists idx_register_logs_arrival_time
  on public.register_logs (arrival_time desc);

-- -----------------------------------------------------------------------------
-- 5. whitelisted_staff: Non-@iiita.ac.in Authorized Staff & Guards
-- -----------------------------------------------------------------------------
create table if not exists public.whitelisted_staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  mobile_no text,
  role text not null default 'GUARD' check (role in ('STUDENT', 'GUARD', 'ADMIN')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6. whitelist_requests: External Staff Access Request Queue
-- -----------------------------------------------------------------------------
create table if not exists public.whitelist_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  mobile_no text not null check (mobile_no ~ '^[6-9][0-9]{9}$'),
  reason text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  approved_role text check (approved_role is null or approved_role in ('STUDENT', 'GUARD', 'ADMIN')),
  created_at timestamptz not null default now()
);

create index if not exists idx_whitelist_requests_status
  on public.whitelist_requests (status, created_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS) Enablement & Defense-in-Depth Policies
-- Backend uses service_role key via Clean Architecture Application Services;
-- Direct PostgREST anon access is locked down except privacy-safe catalog reads.
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.sac_items enable row level security;
alter table public.issue_requests enable row level security;
alter table public.register_logs enable row level security;
alter table public.whitelisted_staff enable row level security;
alter table public.whitelist_requests enable row level security;

drop policy if exists "Public read active sac_items catalog" on public.sac_items;
create policy "Public read active sac_items catalog"
  on public.sac_items
  for select
  to anon, authenticated
  using (is_archived = false);

drop policy if exists "Allow whitelist request submission and status lookup" on public.whitelist_requests;
create policy "Allow whitelist request submission and status lookup"
  on public.whitelist_requests
  for all
  to anon, authenticated
  using (true)
  with check (true);


