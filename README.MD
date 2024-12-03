Performant (batched) database generation for Drizzle that can run in your local testing suite. 

# How it works 

To run tests much faster, it generates a batch consisting of: 
- A single db instance. Either Pglite (Postgres) instance, or a Libsql (Sqlite).
- X copies of your schema, each with a unique ID, loading into the database. 

Then each test calls `.nextTest()`, which returns the batch's database, and the schema for next unused copy. 

# Usage

Example: 

```typescript
const tdbg = new TestSqlDbGenerator<'pg', TestTablePg>(
    TEST_DIR, 
    {
        dialect: 'pg',
        batch_size: 5,
        generate_schemas_for_batch: async (batchPositions, batchTestDirAbsolutePath) => {
            
            const partitioned_schemas = batchPositions.map(batch_position => {
                const storeId = `store${batch_position}`;
                return {
                    batch_position,
                    store_id: storeId,
                    schemas: testTableCreatorPg(storeId)
                }
            })

            const migration_file_absolute_path = createSchemaDefinitionFile({
                test_dir_absolute_path: batchTestDirAbsolutePath,
                table_creator_import: {
                    link_file_pattern: 'test-table.pg.ts',
                    import_name: '{testTableCreatorPg}',
                },
                table_creator_invocation: (storeId)  => {
                    return `testTableCreatorPg('${storeId}')`
                },
            }, partitioned_schemas.map(x => x.store_id));

            return {
                partitioned_schemas,
                migration_file_absolute_path
            }
        }
    }
)

test('Your test', () => {
    const {db, schemas} = tdbg.nextTest();

    // This will be a totally clean schema compared to other tests 
    await db.insert(schemas).values({ name: 'Alice', age: 1 });
})

```