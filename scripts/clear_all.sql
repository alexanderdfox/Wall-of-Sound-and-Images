-- Clear all data from D1 database (keeps table structure)
-- Run manually: wrangler d1 execute tchoff-db --remote --file=scripts/clear_all.sql

DELETE FROM likes;
DELETE FROM comments;
DELETE FROM follows;
DELETE FROM friends;
DELETE FROM images;
DELETE FROM users;
