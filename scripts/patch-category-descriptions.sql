-- Patch category Description and ShortDescription for all taxonomy categories.
-- Safe to re-run: only updates rows where Name matches.
-- Source of truth: docs/quizymode_taxonomy.yaml

UPDATE "Categories" SET
  "Description"      = 'Exam prep for certifications, licensing, and standardized tests at all levels.',
  "ShortDescription" = 'Exam prep for certifications, licensing,'
WHERE "Name" = 'exams';

UPDATE "Categories" SET
  "Description"      = 'Software, hardware, networking, databases, and modern development practices.',
  "ShortDescription" = 'Software, hardware, networking, databases,'
WHERE "Name" = 'tech';

UPDATE "Categories" SET
  "Description"      = 'Finance, marketing, management, strategy, and professional business skills.',
  "ShortDescription" = 'Finance, marketing, management, strategy, and'
WHERE "Name" = 'business';

UPDATE "Categories" SET
  "Description"      = 'Natural sciences, math, and statistics—from biology and chemistry to calculus.',
  "ShortDescription" = 'Natural sciences, math, and statistics—from'
WHERE "Name" = 'science';

UPDATE "Categories" SET
  "Description"      = 'World history, civilizations, events, and key figures from ancient times to today.',
  "ShortDescription" = 'World history, civilizations, events, and'
WHERE "Name" = 'history';

UPDATE "Categories" SET
  "Description"      = 'Countries, capitals, world regions, physical geography, and map skills.',
  "ShortDescription" = 'Countries, capitals, world regions, physical'
WHERE "Name" = 'geography';

UPDATE "Categories" SET
  "Description"      = 'Grammar, vocabulary, and language skills across major world languages.',
  "ShortDescription" = 'Grammar, vocabulary, and language skills'
WHERE "Name" = 'languages';

UPDATE "Categories" SET
  "Description"      = 'Literature, philosophy, art, music, and the cultural study of human thought.',
  "ShortDescription" = 'Literature, philosophy, art, music, and'
WHERE "Name" = 'humanities';

UPDATE "Categories" SET
  "Description"      = 'Government, law, democracy, elections, rights, and civic participation.',
  "ShortDescription" = 'Government, law, democracy, elections, rights,'
WHERE "Name" = 'civics';

UPDATE "Categories" SET
  "Description"      = 'Rules, history, athletes, and statistics across major sports and games.',
  "ShortDescription" = 'Rules, history, athletes, and statistics'
WHERE "Name" = 'sports';

UPDATE "Categories" SET
  "Description"      = 'Wildlife, plants, ecosystems, outdoor recreation, and survival skills.',
  "ShortDescription" = 'Wildlife, plants, ecosystems, outdoor recreation,'
WHERE "Name" = 'nature';

UPDATE "Categories" SET
  "Description"      = 'Pop culture, entertainment, general knowledge, and fun facts from every field.',
  "ShortDescription" = 'Pop culture, entertainment, general knowledge,'
WHERE "Name" = 'trivia';

-- Verify: show name, description, and row count per category after patch
SELECT "Name", left("Description", 60) AS "Description", left("ShortDescription", 40) AS "ShortDescription"
FROM "Categories"
WHERE "Name" IN ('exams','tech','business','science','history','geography','languages','humanities','civics','sports','nature','trivia')
ORDER BY "Name";
