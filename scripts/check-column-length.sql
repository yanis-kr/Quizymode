-- Check the current max length of the Source column in Items table
SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'Items'
    AND column_name = 'Source';

-- Alternative: Get all column info for Items table
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'Items'
ORDER BY ordinal_position;
