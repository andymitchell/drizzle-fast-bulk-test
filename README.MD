Performant (batched) database generation for Drizzle that can run in your local testing suite. 

# How it works 

To run tests much faster, it generates a batch of consisting of: 
- A single db instance. Either Pglite (Postgres) instance, or a Libsql (Sqlite).
- X copies of your schema, each with a unique ID, loading into the database. 

Then each test calls `.nextTest()`, which returns the batch's database, and the schema for next unused copy. 

# Usage