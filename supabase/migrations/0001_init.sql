-- =====================================================================
-- бронювання та оплати. Виконати в Supabase → SQL Editor один раз.
-- =====================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------- Статуси ----------
do $$ begin
  create type booking_status as enum (
    'pending_payment', -- слот утримується, клієнт оплачує
    'paid',            -- оплачено, зустріч підтверджена
    'failed',          -- оплату відхилено
    'expired',         -- час на оплату минув, слот звільнено
    'cancelled',       -- скасовано без повернення (вручну)
    'refunded',        -- кошти повернуто, слот звільнено
    'conflict'         -- оплата прийшла після звільнення слота, а час уже зайнято — потрібне рішення
  );
exception when duplicate_object then null; end $$;

-- ---------- Бронювання ----------
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  order_reference text not null unique,

  service_slug text not null,
  service_name text not null,
  price_eur numeric(10,2) not null,
  charge_amount numeric(10,2) not null,
  charge_currency text not null,

  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_min int not null default 30,
  -- час, зайнятий цим бронюванням разом із перервою після зустрічі (ends_at + buffer_min)
  blocked_until timestamptz not null,

  status booking_status not null default 'pending_payment',
  hold_expires_at timestamptz not null,

  -- контакти (до оплати)
  full_name text not null,
  email text not null,
  contact text not null,
  instagram text not null,
  -- анкета (заповнюється після оплати)
  occupation text,
  main_request text,
  desired_result text,
  questions text,
  questionnaire_at timestamptz,
  socials jsonb not null default '{}'::jsonb,
  strategy jsonb,
  consent_at timestamptz not null,
  utm jsonb,

  -- оплата
  paid_at timestamptz,
  payment_status text,
  payment_system text,
  card_pan text,
  refunded_amount numeric(10,2) not null default 0,
  refunded_at timestamptz,
  cancelled_at timestamptz,
  admin_note text,

  -- виконання після оплати (кожен крок окремо, щоб безпечно повторювати)
  calendar_event_url text,
  zoom_meeting_id text,
  zoom_join_url text,
  confirmation_sent_at timestamptz,
  owner_notified_at timestamptz,
  reminder_sent_at timestamptz,
  fulfilment_error text,
  fulfilling_since timestamptz, -- блокування, щоб дві паралельні обробки не створили дві зустрічі

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ends_after_start check (ends_at > starts_at),
  constraint blocked_after_end check (blocked_until >= ends_at),

  -- ГОЛОВНИЙ ЗАХИСТ ВІД ПОДВІЙНИХ БРОНЮВАНЬ:
  -- два активні бронювання (з перервою) фізично не можуть перетинатися в часі.
  constraint no_overlap exclude using gist (
    tstzrange(starts_at, blocked_until, '[)') with &&
  ) where (status in ('pending_payment', 'paid'))
);

create index if not exists bookings_starts_at_idx on bookings (starts_at);
create index if not exists bookings_status_idx on bookings (status);
create index if not exists bookings_email_idx on bookings (lower(email));
create index if not exists bookings_created_idx on bookings (created_at desc);

-- ---------- Журнал подій оплати (для аудиту та ідемпотентності) ----------
create table if not exists payment_events (
  id bigserial primary key,
  order_reference text not null,
  source text not null,             -- callback | check_status | refund
  transaction_status text,
  signature_valid boolean not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_events_order_idx on payment_events (order_reference);

-- ---------- Налаштування розкладу (один рядок) ----------
create table if not exists availability_settings (
  id int primary key default 1 check (id = 1),
  weekly_hours jsonb not null,
  buffer_min int not null default 30,
  step_min int not null default 30,
  min_notice_min int not null default 1440,
  horizon_days int not null default 30,
  updated_at timestamptz not null default now()
);

insert into availability_settings (id, weekly_hours)
values (1, '{
  "1":[{"start":"10:00","end":"19:00"}],
  "2":[{"start":"10:00","end":"19:00"}],
  "3":[{"start":"10:00","end":"19:00"}],
  "4":[{"start":"10:00","end":"19:00"}],
  "5":[{"start":"10:00","end":"17:00"}],
  "6":[],
  "7":[]
}'::jsonb)
on conflict (id) do nothing;

-- ---------- Заблоковані дні ----------
create table if not exists blocked_dates (
  date date primary key,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- Адміністратори ----------
-- role: owner — усе, включно з поверненнями та налаштуваннями; assistant — лише перегляд
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'assistant')),
  created_at timestamptz not null default now()
);

-- ---------- updated_at ----------
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists bookings_touch on bookings;
create trigger bookings_touch before update on bookings
for each row execute function touch_updated_at();

-- ---------- Звільнення прострочених утримань ----------
create or replace function expire_stale_holds() returns int language sql as $$
  with x as (
    update bookings set status = 'expired'
    where status = 'pending_payment' and hold_expires_at < now()
    returning 1
  ) select count(*)::int from x;
$$;

-- Функцію викликає лише сервер
revoke execute on function expire_stale_holds() from public, anon, authenticated;

-- ---------- Row Level Security ----------
-- Публічного доступу до таблиць немає взагалі. Сайт працює з базою лише з сервера
-- (service role) після перевірок; адмінка — після перевірки ролі в admin_users.
alter table bookings enable row level security;
alter table payment_events enable row level security;
alter table availability_settings enable row level security;
alter table blocked_dates enable row level security;
alter table admin_users enable row level security;

-- Адміністратор може прочитати лише власний запис ролі (для перевірки входу)
drop policy if exists "admin reads own role" on admin_users;
create policy "admin reads own role" on admin_users
  for select to authenticated using (user_id = auth.uid());

revoke all on bookings, payment_events, availability_settings, blocked_dates from anon, authenticated;
