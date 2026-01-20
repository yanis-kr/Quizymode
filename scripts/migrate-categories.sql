-- Delete all items and collections (run before container startup)
-- This script should be run manually before bulk inserts
DELETE FROM "CollectionItems";
DELETE FROM "Collections";
DELETE FROM "ItemKeywords";
DELETE FROM "Ratings";
DELETE FROM "Comments";
DELETE FROM "Items";

