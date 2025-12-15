-- Check if blockchain column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'TokenLaunch' AND column_name = 'blockchain';

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'WalletAnalysis' AND column_name = 'blockchain';
