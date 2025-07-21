import { beforeAll, test, vi } from 'vitest';

import { clearDir, createDrizzleFastBulkTestGenerators, getRelativeTestDir } from "./test-helpers.js";


import {ensureDirSync} from 'fs-extra';
import type { DdtDialect, DdtSqliteDriver } from '@andyrmitchell/drizzle-dialect-types';



const TEST_DIR = getRelativeTestDir(import.meta.url, 'test-schemas/main-testcontainers');

beforeAll(() => {
    vi.setConfig({ testTimeout: 60000 }) // Test Containers need a long time to run 
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

    test(`[${key}] basic works`, async (cx) => {
        

        const tdbg = createDrizzleFastBulkTestGenerators(TEST_DIR, key as 'pg', 'postgres');
        const { db, schemas } = await tdbg.nextTest();

        await db.insert(schemas).values({ name: 'Alice', age: 1 });
        const rows = await db.select().from(schemas);

        expect(rows[0]!.name).toBe('Alice');

    })

}

