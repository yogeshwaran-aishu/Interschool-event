-- InterSchool Connect v1 schema (Backend PRD "Database schema"), adapted where the Angular
-- app needs more: coordinators per event/invitation, phone numbers, the "invited" user state,
-- and a submitted_at marker on registrations for the nomination step.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role       AS ENUM ('app_admin','school_admin','teacher','student');
CREATE TYPE record_status   AS ENUM ('active','suspended');
CREATE TYPE user_status     AS ENUM ('invited','active','suspended');
CREATE TYPE event_status    AS ENUM ('draft','open','closed','completed','cancelled');
CREATE TYPE invite_status   AS ENUM ('pending','accepted','rejected','expired','revoked');
CREATE TYPE reg_status      AS ENUM ('applied','school_approved','school_rejected',
                                     'host_confirmed','host_rejected','withdrawn');
CREATE TYPE category_type   AS ENUM ('solo','team');
CREATE TYPE gender_rule     AS ENUM ('any','female','male');
CREATE TYPE gender          AS ENUM ('female','male','other');

CREATE TABLE schools (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  board         text NOT NULL,
  city          text NOT NULL,
  address       text NOT NULL,
  contact_email citext NOT NULL,
  contact_phone text NOT NULL DEFAULT '',
  status        record_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, city)
);

CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid REFERENCES schools(id),
  role                 user_role NOT NULL,
  full_name            text NOT NULL,
  email                citext UNIQUE,
  phone                text,
  login_id             citext NOT NULL UNIQUE,
  password_hash        text,
  must_change_password boolean NOT NULL DEFAULT true,
  can_host_events      boolean NOT NULL DEFAULT false,
  status               user_status NOT NULL DEFAULT 'invited',
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'app_admin') = (school_id IS NULL))
);
CREATE INDEX ON users (school_id, role);

CREATE TABLE student_profiles (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school_id           uuid NOT NULL REFERENCES schools(id),
  admission_no        text NOT NULL,
  class               smallint NOT NULL CHECK (class BETWEEN 1 AND 12),
  section             text NOT NULL DEFAULT '',
  gender              gender NOT NULL,
  date_of_birth       date,
  guardian_name       text NOT NULL,
  guardian_email      citext,
  guardian_phone      text,
  parental_consent    boolean NOT NULL DEFAULT false,
  consent_recorded_at timestamptz,
  UNIQUE (school_id, admission_no),
  CHECK (guardian_email IS NOT NULL OR guardian_phone IS NOT NULL)
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  family_id   uuid NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz
);
CREATE INDEX ON refresh_tokens (family_id);

CREATE TABLE login_failures (
  id        bigserial PRIMARY KEY,
  login_id  citext NOT NULL,
  ip        text NOT NULL,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON login_failures (login_id, at);
CREATE INDEX ON login_failures (ip, at);

CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_school_id  uuid NOT NULL REFERENCES schools(id),
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  venue           text NOT NULL,
  starts_at       timestamptz NOT NULL,
  reg_deadline    timestamptz NOT NULL,
  status          event_status NOT NULL DEFAULT 'draft',
  cancel_reason   text,
  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (reg_deadline < starts_at)
);
CREATE INDEX ON events (host_school_id, status);

CREATE TABLE event_coordinators (
  event_id  uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           text NOT NULL,
  min_class      smallint NOT NULL,
  max_class      smallint NOT NULL,
  gender_rule    gender_rule NOT NULL DEFAULT 'any',
  type           category_type NOT NULL DEFAULT 'solo',
  team_size      smallint,
  max_per_school smallint NOT NULL CHECK (max_per_school > 0),
  position       smallint NOT NULL DEFAULT 0,
  CHECK (min_class BETWEEN 1 AND 12 AND max_class BETWEEN 1 AND 12),
  CHECK (min_class <= max_class),
  CHECK ((type = 'team') = (team_size IS NOT NULL)),
  UNIQUE (event_id, name)
);

CREATE TABLE invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_school_id  uuid NOT NULL REFERENCES schools(id),
  status           invite_status NOT NULL DEFAULT 'pending',
  responded_by     uuid REFERENCES users(id),
  responded_at     timestamptz,
  response_note    text,
  submitted_at     timestamptz,
  reminder_sent_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, guest_school_id)
);
CREATE INDEX ON invitations (guest_school_id, status);

CREATE TABLE invitation_coordinators (
  invitation_id  uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (invitation_id, user_id)
);

CREATE TABLE registrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id     uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  category_id       uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  student_id        uuid NOT NULL REFERENCES users(id),
  school_id         uuid NOT NULL REFERENCES schools(id),
  status            reg_status NOT NULL DEFAULT 'applied',
  submitted_at      timestamptz,             -- sent to the host as a nomination
  school_decided_by uuid REFERENCES users(id),
  school_decided_at timestamptz,
  host_decided_by   uuid REFERENCES users(id),
  host_decided_at   timestamptz,
  reject_reason     text,
  applied_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- One row per student per category: a withdrawn student re-applies on the same row.
CREATE UNIQUE INDEX registrations_one_per_category ON registrations (category_id, student_id);
CREATE INDEX ON registrations (invitation_id, category_id, status);
CREATE INDEX ON registrations (school_id, status);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications (user_id, read_at, created_at DESC);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id),
  school_id   uuid REFERENCES schools(id),
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text NOT NULL,
  before      jsonb,
  after       jsonb,
  request_id  text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_logs (school_id, at DESC);

-- Transactional outbox / job queue. Services insert jobs in the same transaction as the
-- data change; the worker claims them with FOR UPDATE SKIP LOCKED.
CREATE TABLE jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts    smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  run_after   timestamptz NOT NULL DEFAULT now(),
  result      jsonb,
  last_error  text,
  created_by  uuid REFERENCES users(id),
  school_id   uuid REFERENCES schools(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_due ON jobs (run_after) WHERE status = 'queued';

CREATE TABLE cron_runs (
  name     text NOT NULL,
  period   text NOT NULL,
  ran_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (name, period)
);

CREATE TABLE idempotency_keys (
  key         text NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method      text NOT NULL,
  path        text NOT NULL,
  status      smallint NOT NULL,
  response    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
