-- Run as MySQL root (or admin). Used by Docker init or manually on the server.
-- Creates reelmaker DB and grants app user access (no CREATE DATABASE privilege needed for app user).

CREATE DATABASE IF NOT EXISTS reelmaker
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON reelmaker.* TO 'user'@'%';
FLUSH PRIVILEGES;
