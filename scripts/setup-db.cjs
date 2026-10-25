const fs = require("node:fs");
const { Client } = require("pg");
process.loadEnvFile();
(async () => {
  let client;
  try {
    const url = new URL(process.env.DATABASE_URL);
    for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"])
      url.searchParams.delete(key);
    client = new Client({
      connectionString: url.href,
      connectionTimeoutMillis: 12000,
      ssl: {
        rejectUnauthorized: true,
        ca: fs.readFileSync("supabase/prod-ca-2021.crt", "utf8"),
      },
    });
    await client.connect();
    await client.query(fs.readFileSync("supabase/schema.sql", "utf8"));
    await client.query(fs.readFileSync("supabase/usernames.sql", "utf8"));
    console.log("Database schema and ownership policies applied.");
  } catch (error) {
    console.error(
      "Database setup failed. Code: " +
        (error.code || error.cause?.code || "CONNECTION_ERROR"),
    );
    process.exitCode = 1;
  } finally {
    if (client) await client.end();
  }
})();
