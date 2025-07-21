Performant (batched) database generation for Drizzle that can run in your local testing suite. 

# The problem

It's slow to spin up a local database (e.g. Pglite) and slow to run drizzle-kit. Setting up a new database+schema per test would be unbearably slow.

# How it works 

To run tests much faster, it generates a batch consisting of: 
- A single db instance. E.g. Pglite (Postgres) instance, or a Libsql (Sqlite).
- X copies of your schema, each with a unique ID, loaded into the database. 

Then each test calls `.nextTest()`, which returns the batch's database, and the schema for next unused copy. 

# Usage

Example: 

```typescript
const tdbg = new DrizzleFastBulkTestGenerator<'pg', TestTablePg>(
    TEST_DIR, 
    {
        db: {
            dialect: 'pg',
            driver: 'pglite',
        },
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
                table_creator_invocation: (storeIds)  => {

                    return storeIds.map(storeId => `export const store_${storeId} = testTableCreatorPg('${storeId}');`).join("\n")
                    
                }
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

# Troubleshooting

## In a typescript ESM project, drizzle-kit errors with MODULE_NOT_FOUND

This happens because drizzle-kit doesn't fully support ESM-only formats. 

So when this package generates files for drizzle-kit to run (using `createSchemaDefinitionFile`), if the imports have '.js' (as is normal for ESM typescript files), drizzle-kit will fail. 