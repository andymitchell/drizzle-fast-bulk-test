import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { sql } from "drizzle-orm";
import { setupTestSqliteDb, TestSqlDbGenerator } from "./TestSqlDbGenerator";
import { fileIoSyncNode } from "@andyrmitchell/file-io";
import { fileURLToPath } from 'url';
import { testTableCreatorPg, TestTablePg } from "./test-table.pg";
import { createSchemaDefinitionFile } from "./createSchemaDefinitionFile";
import { testTableCreatorSqlite, TestTableSqlite } from "./test-table.sqlite";

beforeAll(() => {
    clearDir(getRelativeTestDir(import.meta.url))
})

function getRelativeTestDir(testScriptMetaUrl:string):string {
    return `${fileIoSyncNode.directory_name(fileURLToPath(testScriptMetaUrl))}/test-schemas`;
}
function clearDir(testDir:string):void {


    if( fileIoSyncNode.has_directory(testDir) ) {
        fileIoSyncNode.remove_directory(testDir, true);
    }

}

const TEST_DIR = getRelativeTestDir(import.meta.url);
const tdbgPg = new TestSqlDbGenerator<'pg', TestTablePg>(
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
                table_creator_invocation: (storeIds)  => {

                    return storeIds.map(storeId => `export const store_${storeId} = testTableCreatorPg('${storeId}');`).join("\n")
                    
                },
            }, partitioned_schemas.map(x => x.store_id));

            return {
                partitioned_schemas,
                migration_file_absolute_path
            }
        }
    }
)

const tdbgSqlite = new TestSqlDbGenerator<'sqlite', TestTableSqlite>(
    TEST_DIR, 
    {
        dialect: 'sqlite',
        batch_size: 5,
        generate_schemas_for_batch: async (batchPositions, batchTestDirAbsolutePath) => {
            
            const partitioned_schemas = batchPositions.map(batch_position => {
                const storeId = `store${batch_position}`;
                return {
                    batch_position,
                    store_id: storeId,
                    schemas: testTableCreatorSqlite(storeId)
                }
            })

            const migration_file_absolute_path = createSchemaDefinitionFile({
                test_dir_absolute_path: batchTestDirAbsolutePath,
                table_creator_import: {
                    link_file_pattern: 'test-table.sqlite.ts',
                    import_name: '{testTableCreatorSqlite}',
                },
                table_creator_invocation: (storeIds)  => {

                    return storeIds.map(storeId => `export const store_${storeId} = testTableCreatorSqlite('${storeId}');`).join("\n")
                    
                },
            }, partitioned_schemas.map(x => x.store_id));

            return {
                partitioned_schemas,
                migration_file_absolute_path
            }
        }
    }
)


test('postgres works', async () => {


    const {db, schemas} = await tdbgPg.nextTest();
    
    await db.insert(schemas).values({ name: 'Alice', age: 1 });
    const rows = await db.select().from(schemas);

    expect(rows[0]!.name).toBe('Alice');
    //console.log(rows);
})

test('sqlite works', async () => {
    
    const {db, schemas} = await tdbgSqlite.nextTest();
    
    await db.insert(schemas).values({ name: 'Alice', age: 1 });
    const rows = await db.select().from(schemas);

    expect(rows[0]!.name).toBe('Alice');
})


test('postgres works - reuse db and data is partitioned into schemas', async () => {

    
    const createSt1 = Date.now();
    const result1 = await tdbgPg.nextTest();
    const db1 = result1.db;
    const schemas1 = result1.schemas;
    const createDur1 = Date.now()-createSt1;

    const createSt2 = Date.now();
    const result2 = await tdbgPg.nextTest();
    const db2 = result2.db;
    const schemas2 = result2.schemas;
    const createDur2 = Date.now()-createSt2;

  
    await db1.insert(schemas1).values({ name: 'Bob' });
    await db2.insert(schemas2).values({ name: 'Alice' });


    const rows1 = await db1.select().from(schemas1);
    const rows2 = await db2.select().from(schemas2);


    expect(db1).toEqual(db2);
    expect(db1===db2).toBe(true);
    expect(schemas1===schemas2).toBe(false);

    expect(rows1.length).toBe(1);
    expect(rows1[0]!.name).toBe('Bob');


    expect(rows2.length).toBe(1);
    expect(rows2[0]!.name).toBe('Alice');

    expect(createDur2).toBeLessThan(50); // Should be super fast due to batch create
    
})


test('sqlite works - reuse db and data is partitioned into schemas', async () => {

    
    const createSt1 = Date.now();
    const result1 = await tdbgSqlite.nextTest();
    const db1 = result1.db;
    const schemas1 = result1.schemas;
    const createDur1 = Date.now()-createSt1;

    const createSt2 = Date.now();
    const result2 = await tdbgSqlite.nextTest();
    const db2 = result2.db;
    const schemas2 = result2.schemas;
    const createDur2 = Date.now()-createSt2;

  
    await db1.insert(schemas1).values({ name: 'Bob' });
    await db2.insert(schemas2).values({ name: 'Alice' });


    const rows1 = await db1.select().from(schemas1);
    const rows2 = await db2.select().from(schemas2);


    expect(db1).toEqual(db2);
    expect(db1===db2).toBe(true);
    expect(schemas1===schemas2).toBe(false);

    expect(rows1.length).toBe(1);
    expect(rows1[0]!.name).toBe('Bob');


    expect(rows2.length).toBe(1);
    expect(rows2[0]!.name).toBe('Alice');

    expect(createDur2).toBeLessThan(50); // Should be super fast due to batch create
    
})


test('sqlite is created', async () => {


    const db = await setupTestSqliteDb();

    const schema = sqliteTable('kv_store', {
        key: text('key').primaryKey(),
        value: text('value'),
    });

    
    await db.run(sql.raw(`CREATE TABLE kv_store (
    key TEXT PRIMARY KEY,
    value TEXT
);`))

    await db.insert(schema).values({ 'key': 'name', value: 'Alice' });
    const rows = await db.select().from(schema);
    
    expect(rows.length).toBe(1);
    expect(rows[0]!.value).toBe('Alice');

})