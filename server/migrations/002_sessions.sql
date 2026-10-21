-- Schema expected by connect-pg-simple; application startup never creates tables.
CREATE TABLE user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX user_sessions_expire ON user_sessions (expire);
