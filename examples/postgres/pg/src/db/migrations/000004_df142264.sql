BEGIN;

CREATE TABLE organization_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE organizations ALTER COLUMN name DROP DEFAULT;

COMMIT;
