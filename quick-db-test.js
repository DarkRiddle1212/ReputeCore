const { Client } = require("pg");

const client = new Client({
  connectionString:
    "postgresql://postgres.ubokbeiagpobhmikeyai:I1FzXCxBauHp8nNr@aws-1-eu-west-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

client
  .connect()
  .then(() => client.query("SELECT 1 as test"))
  .then((res) => {
    console.log("✅ Supabase connected! Result:", res.rows[0].test);
    return client.query('SELECT COUNT(*) FROM "TokenLaunch"');
  })
  .then((res) => {
    console.log("TokenLaunch count:", res.rows[0].count);
    client.end();
  })
  .catch((err) => {
    console.log("❌ Error:", err.message);
    client.end();
  });
