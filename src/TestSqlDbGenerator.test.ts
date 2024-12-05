import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { beforeAll, test } from 'vitest';

import { sql } from "drizzle-orm";
import { setupTestSqliteDbBetterSqlite3, setupTestSqliteDbLibSql, TestSqlDbGenerator } from "./TestSqlDbGenerator";
import { sleep } from "@andyrmitchell/utils";

import { clearDir, createTestSqlDbGenerators, getRelativeTestDir } from "./test-helpers";
import { COMMON_DATABASES, CommonDatabases } from "./types";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {ensureDirSync} from 'fs-extra';


const TEST_DIR = getRelativeTestDir(import.meta.url, 'test-schemas/main');

beforeAll(() => {
    clearDir(TEST_DIR)
    ensureDirSync(TEST_DIR)
})


afterAll(() => {
    clearDir(TEST_DIR);
})




const commonDatabases = COMMON_DATABASES.filter(x => x !== 'sqlite');

for (const key of commonDatabases) {

    test.only(`[${key}] basic works`, async () => {

        const tdbg = createTestSqlDbGenerators(TEST_DIR, key as 'pg');
        const { db, schemas } = await tdbg.nextTest();

        await db.insert(schemas).values({ name: 'Alice', age: 1 });
        const rows = await db.select().from(schemas);

        expect(rows[0]!.name).toBe('Alice');

    })

    test(`[${key}] reuse db and data is partitioned into schemas`, async () => {


        const tdbg = createTestSqlDbGenerators(TEST_DIR, key as 'pg');

        const createSt1 = Date.now();
        const result1 = await tdbg.nextTest();
        const db1 = result1.db;
        const schemas1 = result1.schemas;
        const createDur1 = Date.now() - createSt1;

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

    test(`[${key}] sqlite survives slow concurrent transactions`, async (cx) => {
        if (
            key.indexOf('sqlite') !== 0
            || key === 'sqlite-libsql' // Currently failing without support for busy_timeout. See libsql-failing.test.ts. 
        ) {
            cx.skip();
        }

        let db: LibSQLDatabase | BetterSQLite3Database;
        switch (key) {
            case 'sqlite-bettersqlite3':
                db = await setupTestSqliteDbBetterSqlite3(TEST_DIR);
                break;
            case 'sqlite-libsql':
                db = await setupTestSqliteDbLibSql(TEST_DIR);
                break;
            default:
                throw new Error('unknown impl');
        }


        const schema = sqliteTable('kv_store', {
            key: text('key').primaryKey(),
            value: text('value'),
        });


        await db.run(sql.raw(`CREATE TABLE kv_store (
        key TEXT PRIMARY KEY,
        value TEXT
    );`))




        const p1 = db.transaction(async tx => {
            await tx.insert(schema).values({ 'key': 'name1', value: 'Alice' });
            await sleep(400);
            await tx.insert(schema).values({ 'key': 'name2', value: 'Bob' });
        })

        const p2 = db.transaction(async tx => {
            await tx.insert(schema).values({ 'key': 'name3', value: 'Charleen' });
            await sleep(400);
            await tx.insert(schema).values({ 'key': 'name4', value: 'David' });
        })

        await Promise.all([p1, p2]);

        const rows = await db.select().from(schema);

        expect(rows.length).toBe(4);

        expect(rows[3]!.value).toBe('David');


    })

}


