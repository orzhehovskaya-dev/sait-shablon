-- Анкета заповнюється після оплати. Потрібно лише якщо 0001 уже виконано раніше;
-- на новій базі ці команди нічого не змінюють.
alter table bookings alter column occupation drop not null;
alter table bookings alter column main_request drop not null;
alter table bookings alter column desired_result drop not null;
alter table bookings alter column questions drop not null;
alter table bookings add column if not exists questionnaire_at timestamptz;
