-- Результати перевірок підключень (сторінка «Підключення» в адмінці).
-- Сервіс вважається робочим лише після успішної перевірки, записаної тут.
create table if not exists integration_checks (
  name text primary key,
  ok boolean not null,
  detail text,
  checked_at timestamptz not null default now()
);

alter table integration_checks enable row level security;
revoke all on integration_checks from anon, authenticated;
