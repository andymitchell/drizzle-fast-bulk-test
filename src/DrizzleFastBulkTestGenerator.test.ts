import { beforeAll, test } from 'vitest';

import { clearDir, createDrizzleFastBulkTestGenerators, getRelativeTestDir } from "./test-helpers.js";


import {ensureDirSync} from 'fs-extra';
import type { DdtDialect, DdtSqliteDriver } from '@andyrmitchell/drizzle-dialect-types';
import { DrizzleFastBulkTestGenerator } from './DrizzleFastBulkTestGenerator.js';
import { promiseWithTrigger } from '@andyrmitchell/utils';



const TEST_DIR = getRelativeTestDir(import.meta.url, 'test-schemas/main');

beforeAll(() => {
    clearDir(TEST_DIR)
    ensureDirSync(TEST_DIR)
})


afterAll(() => {
    clearDir(TEST_DIR);
})

runTests('pg');
runTests('sqlite', 'better-sqlite3');
runTests('sqlite', 'libsql');

function runTests(key:DdtDialect, sqliteDriver?:DdtSqliteDriver) {

    test(`[${key}] basic works`, async () => {

        const tdbg = createDrizzleFastBulkTestGenerators(TEST_DIR, key as 'pg', 'pglite');
        const { db, schemas } = await tdbg.nextTest();

        await db.insert(schemas).values({ name: 'Alice', age: 1 });
        const rows = await db.select().from(schemas);

        expect(rows[0]!.name).toBe('Alice');

    })

    

    test(`[${key}] reuse db and data is partitioned into schemas`, async () => {


        const tdbg = createDrizzleFastBulkTestGenerators(TEST_DIR, key as 'pg', 'pglite');

        
        const result1 = await tdbg.nextTest();
        const db1 = result1.db;
        const schemas1 = result1.schemas;
        

        const createSt2 = Date.now();
        const result2 = await tdbg.nextTest();
        const db2 = result2.db;
        const schemas2 = result2.schemas;
        const createDur2 = Date.now() - createSt2;


        await db1.insert(schemas1).values({ name: 'Bob' });
        await db2.insert(schemas2).values({ name: 'Alice' });


        const rows1 = await db1.select().from(schemas1);
        const rows2 = await db2.select().from(schemas2);


        expect(db1).toEqual(db2);
        expect(db1 === db2).toBe(true);
        expect(schemas1 === schemas2).toBe(false);

        expect(rows1.length).toBe(1);
        expect(rows1[0]!.name).toBe('Bob');


        expect(rows2.length).toBe(1);
        expect(rows2[0]!.name).toBe('Alice');

        expect(createDur2).toBeLessThan(50); // Should be super fast due to batch create

    })

}




test('regression', async () => {


    const pwt = promiseWithTrigger<void>(5000);

    const tdbg = new DrizzleFastBulkTestGenerator(
        TEST_DIR, 
        {
            db: {
                dialect: 'pg',
                driver: 'pglite'
            },
            batch_size: 1,
            // @ts-ignore
            generate_schemas_for_batch: async (batchPositions:number[], batchTestDirAbsolutePath:string) => {
                pwt.trigger();
            },
            verbose: true
        }
    );
    
    setTimeout(async () => {
        try {
            await tdbg.nextTest();
        } catch(e) {}
    }, 0);
    

    await pwt.promise;

    
    

})