-- =============================================================================
-- SACPulse Migration 002: ACID Stored Procedures with Row-Level Locking
-- Prevents race conditions across counter checkouts, P2P splits, and returns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. approve_issue_request_tx
-- Atomically locks `issue_requests` and requested `sac_items` rows (`FOR UPDATE`),
-- verifies 120s server TTL & stock availability, decrements stock, and spawns
-- 1 `register_logs` row per physical unit sharing a newly generated `batch_id`.
-- -----------------------------------------------------------------------------
create or replace function public.approve_issue_request_tx(
  p_request_id uuid,
  p_guard_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.issue_requests%rowtype;
  v_line jsonb;
  v_item_id uuid;
  v_qty integer;
  v_item public.sac_items%rowtype;
  v_batch_id uuid := gen_random_uuid();
  v_units_issued integer := 0;
  v_i integer;
begin
  select *
    into v_req
    from public.issue_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'IssueRequest % not found', p_request_id;
  end if;

  if v_req.status <> 'PENDING' then
    raise exception 'Cannot approve request in status %', v_req.status;
  end if;

  if now() >= v_req.expires_at then
    update public.issue_requests
       set status = 'TIMED_OUT'
     where id = p_request_id;
    raise exception 'Cannot approve request: 2-minute server TTL has expired';
  end if;

  for v_line in select * from jsonb_array_elements(v_req.requested_items)
  loop
    v_item_id := coalesce((v_line->>'itemId')::uuid, (v_line->>'item_id')::uuid);
    v_qty := greatest(1, coalesce((v_line->>'qty')::integer, 1));

    select *
      into v_item
      from public.sac_items
     where id = v_item_id
       and is_archived = false
     for update;

    if not found then
      raise exception 'SAC item % not found', v_item_id;
    end if;

    if v_item.item_type = 'ROOM_KEY' then
      if v_qty <> 1 then
        raise exception 'Room key % can only be issued 1 unit at a time', v_item.name;
      end if;
      if v_item.available_qty < 1 or v_item.occupied_since is not null then
        raise exception 'Insufficient stock: Room % is already occupied', v_item.name;
      end if;

      update public.sac_items
         set available_qty = 0,
             occupied_since = now()
       where id = v_item.id;
    else
      if v_item.available_qty < v_qty then
        raise exception 'Insufficient stock for %. Requested %, Available %',
          v_item.name, v_qty, v_item.available_qty;
      end if;

      update public.sac_items
         set available_qty = available_qty - v_qty
       where id = v_item.id;
    end if;

    for v_i in 1..v_qty
    loop
      insert into public.register_logs (
        batch_id,
        student_id,
        item_id,
        arrival_time,
        departure_time,
        status,
        pending_transfer_to_id
      ) values (
        v_batch_id,
        v_req.student_id,
        v_item.id,
        now(),
        null,
        'ISSUED',
        null
      );
      v_units_issued := v_units_issued + 1;
    end loop;
  end loop;

  update public.issue_requests
     set status = 'APPROVED',
         approved_by_id = p_guard_id
   where id = p_request_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'units_issued', v_units_issued,
    'student_id', v_req.student_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. execute_transfer_split_tx
-- Blueprint Rule 8: Atomic P2P Row Split.
-- Closes Student A's row as `RETURNED_VIA_TRANSFER` and inserts Student B's
-- active `ISSUED` row sharing the original `batch_id` in a single transaction.
-- -----------------------------------------------------------------------------
create or replace function public.execute_transfer_split_tx(
  p_entry_id uuid,
  p_recipient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.register_logs%rowtype;
  v_recipient public.users%rowtype;
  v_new_entry_id uuid := gen_random_uuid();
begin
  select *
    into v_entry
    from public.register_logs
   where id = p_entry_id
   for update;

  if not found then
    raise exception 'Register entry % not found', p_entry_id;
  end if;

  if v_entry.status <> 'ISSUED_TRANSFER_PENDING' then
    raise exception 'Transfer status mismatch: expected ISSUED_TRANSFER_PENDING, got %', v_entry.status;
  end if;

  if v_entry.pending_transfer_to_id is distinct from p_recipient_id then
    raise exception 'Recipient mismatch on pending transfer %', p_entry_id;
  end if;

  select *
    into v_recipient
    from public.users
   where id = p_recipient_id
   for update;

  if not found then
    raise exception 'Recipient student % not found', p_recipient_id;
  end if;

  if v_recipient.is_defaulter or (v_recipient.penalty_until is not null and v_recipient.penalty_until > now()) then
    raise exception 'Recipient student % is currently restricted from receiving items', v_recipient.name;
  end if;

  update public.register_logs
     set status = 'RETURNED_VIA_TRANSFER',
         departure_time = now(),
         pending_transfer_to_id = null
   where id = p_entry_id;

  insert into public.register_logs (
    id,
    batch_id,
    student_id,
    item_id,
    arrival_time,
    departure_time,
    status,
    pending_transfer_to_id
  ) values (
    v_new_entry_id,
    v_entry.batch_id,
    p_recipient_id,
    v_entry.item_id,
    now(),
    null,
    'ISSUED',
    null
  );

  return jsonb_build_object(
    'old_entry_id', p_entry_id,
    'new_entry_id', v_new_entry_id,
    'batch_id', v_entry.batch_id,
    'recipient_name', v_recipient.name
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. close_guard_return_tx
-- Blueprint Rule 7 & 9: Physical Guard Counter Return Override.
-- Wipes any unaccepted `pending_transfer_to_id = NULL`, records departure,
-- restores intact stock or records damaged stock + locks holder as defaulter.
-- -----------------------------------------------------------------------------
create or replace function public.close_guard_return_tx(
  p_entry_id uuid,
  p_is_damaged boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.register_logs%rowtype;
  v_item public.sac_items%rowtype;
  v_next_status text;
begin
  select *
    into v_entry
    from public.register_logs
   where id = p_entry_id
   for update;

  if not found then
    raise exception 'Register entry % not found', p_entry_id;
  end if;

  if v_entry.status not in ('ISSUED', 'ISSUED_TRANSFER_PENDING') then
    raise exception 'Register entry % is already closed in status %', p_entry_id, v_entry.status;
  end if;

  select *
    into v_item
    from public.sac_items
   where id = v_entry.item_id
   for update;

  v_next_status := case when p_is_damaged then 'DAMAGED' else 'RETURNED' end;

  update public.register_logs
     set status = v_next_status,
         departure_time = now(),
         pending_transfer_to_id = null
   where id = p_entry_id;

  if p_is_damaged then
    if v_item.item_type = 'ROOM_KEY' then
      update public.sac_items
         set available_qty = 0,
             occupied_since = null
       where id = v_item.id;
    else
      update public.sac_items
         set damaged_qty = least(total_qty, damaged_qty + 1)
       where id = v_item.id;
    end if;

    update public.users
       set is_defaulter = true
     where id = v_entry.student_id;
  else
    if v_item.item_type = 'ROOM_KEY' then
      update public.sac_items
         set available_qty = 1,
             occupied_since = null
       where id = v_item.id;
    else
      update public.sac_items
         set available_qty = least(total_qty - damaged_qty, available_qty + 1)
       where id = v_item.id;
    end if;
  end if;

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'status', v_next_status,
    'item_id', v_entry.item_id,
    'student_id', v_entry.student_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. close_guard_batch_return_tx
-- Blueprint Rule 6 & 7: "Return All (Intact)" across all active units of a batch.
-- -----------------------------------------------------------------------------
create or replace function public.close_guard_batch_return_tx(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.register_logs%rowtype;
  v_item public.sac_items%rowtype;
  v_returned_count integer := 0;
begin
  for v_entry in
    select *
      from public.register_logs
     where batch_id = p_batch_id
       and status in ('ISSUED', 'ISSUED_TRANSFER_PENDING')
     for update
  loop
    update public.register_logs
       set status = 'RETURNED',
           departure_time = now(),
           pending_transfer_to_id = null
     where id = v_entry.id;

    select *
      into v_item
      from public.sac_items
     where id = v_entry.item_id
     for update;

    if v_item.item_type = 'ROOM_KEY' then
      update public.sac_items
         set available_qty = 1,
             occupied_since = null
       where id = v_item.id;
    else
      update public.sac_items
         set available_qty = least(total_qty - damaged_qty, available_qty + 1)
       where id = v_item.id;
    end if;

    v_returned_count := v_returned_count + 1;
  end loop;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'returned_count', v_returned_count
  );
end;
$$;

