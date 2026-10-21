CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  password_hash TEXT NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'consultant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);
CREATE UNIQUE INDEX one_consultant ON users (role) WHERE role = 'consultant';

-- ISO weekday: Monday=1, Sunday=7. An absent row means unavailable.
CREATE TABLE weekly_hours (
  weekday SMALLINT PRIMARY KEY CHECK (weekday BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (start_time < end_time),
  CHECK (extract(minute FROM start_time) IN (0, 30) AND extract(second FROM start_time) = 0),
  CHECK (extract(minute FROM end_time) IN (0, 30) AND extract(second FROM end_time) = 0),
  CHECK (start_time < TIME '24:00' AND end_time <= TIME '24:00')
);

CREATE TABLE blocked_slots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL UNIQUE CHECK (isfinite(starts_at)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL CHECK (isfinite(starts_at)),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ,
  CHECK ((status = 'confirmed' AND canceled_at IS NULL) OR
         (status = 'canceled' AND canceled_at IS NOT NULL AND isfinite(canceled_at) AND canceled_at >= created_at))
);
CREATE UNIQUE INDEX one_confirmed_booking_per_time ON bookings (starts_at) WHERE status = 'confirmed';
CREATE INDEX bookings_customer_time ON bookings (customer_id, starts_at);
