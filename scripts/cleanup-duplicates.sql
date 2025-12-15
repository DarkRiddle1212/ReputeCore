-- Clean up duplicate TokenLaunch records before migration
-- Keep the most recent record for each (token, creator) combination

DELETE FROM "TokenLaunch"
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY token, creator ORDER BY "createdAt" DESC) as rn
    FROM "TokenLaunch"
  ) t
  WHERE t.rn > 1
);
