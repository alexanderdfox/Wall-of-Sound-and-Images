-- Clear all data from D1 database (keeps table structure)
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/clear_all.sql

DELETE FROM likes;
DELETE FROM comments;
DELETE FROM follows;
DELETE FROM friends;
DELETE FROM images;
DELETE FROM users;
