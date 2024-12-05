import { test } from 'vitest';
import { fileURLToPath } from 'url';
import { createClient } from "@libsql/client"; // "^0.14.0"
import {v4 as uuidv4} from 'uuid';
import {dirname} from 'path';

import { clearDir, getRelativeTestDir } from './test-helpers';
import { ensureDirSync} from 'fs-extra';

// LibSql doesn't seem to support busy_timeout https://www.sqlite.org/c3ref/busy_timeout.html 
// This means that two transactions that overlap will result in a "database is locked" error, and the app code has to handle retrying.
//  An overlap is very common in an async codebase. 
// I have requested clarity on LibSql's plans at https://github.com/tursodatabase/libsql-client-ts/issues/288

// This test proves that busy_timeout is ignored, by showing it throw an error. 
// IF THIS TEST FAILS, THAT IS GREAT! IT MEANS LIBSQL NOW SUPPORTS BUSY_TIMEOUT. 



const TEST_DIR = getRelativeTestDir(import.meta.url, 'test-schemas/libsql');

beforeAll(() => {
    clearDir(TEST_DIR)
    ensureDirSync(TEST_DIR)
})

afterAll(() => {
    clearDir(TEST_DIR);
})


test(`LibSql fails at concurrent transactions even with busy_timeout`, async () => {
    const testDir = `${dirname(fileURLToPath(import.meta.url))}/test-schemas`
    

    const url = `file:${testDir}/${uuidv4()}.db`

    // Turn on WAL mode. Speeding things up, making a transaction collision less likely. 
    /*
    // Disabled, because it makes no difference to the test
    const preClient = createClient({
        url
    });
    await preClient.execute('PRAGMA journal_mode = WAL;'); // Speeds things up, so collisions less likely. Makes no difference to the transactions failing. 
    preClient.close();
    */

    const client = createClient({
        url
    });

    // This should make Sqlite retry when it encounters a lock; but it's not having an impact. https://www.sqlite.org/c3ref/busy_timeout.html 
    // In contrast, this logic works with BetterSqlite3. 
    await client.execute('PRAGMA busy_timeout = 5000;'); 

    await client.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )
    `);

    let databaseLockedError = false;

    try {
        // Wrap a transaction in a promise, so it can run concurrently
        const txPath1 = new Promise<void>(async (accept, reject) => {
            try {
                const tx = await client.transaction('write');
                await tx.execute({ sql: 'INSERT INTO users (name) VALUES (?)', args: ['Alice'] });
                await tx.execute({ sql: 'INSERT INTO users (name) VALUES (?)', args: ['Bob'] });
                await tx.commit()
                accept();
            } catch (e) {
                reject(e);
            }

        });

        // await txPath1; // If uncommented, this succeeds as it makes it run linear

        // Wrap a transaction in a promise, so it can run concurrently
        const txPath2 = new Promise<void>(async (accept, reject) => {
            try {
                const tx2 = await client.transaction('write'); // Throws error here: "SqliteError: database is locked" / { code: 'SQLITE_BUSY', rawCode: 5 }
                await tx2.execute({ sql: 'INSERT INTO users (name) VALUES (?)', args: ['Charleen'] });
                await tx2.execute({ sql: 'INSERT INTO users (name) VALUES (?)', args: ['David'] });
                await tx2.commit()
                accept();
            } catch (e) {
                reject(e);
            }

        });

        await Promise.all([txPath1, txPath2]);

        // Verify the data
        const resultFinal = await client.execute('SELECT * FROM users');
        expect(resultFinal.rows.length).toBe(4);
    } catch(e) {
        if( e instanceof Error && e.message.indexOf('database is locked')>-1 ) {
            databaseLockedError = true
        } else {
            throw e;
        }
    }

    // See above - it's good news if this fails! 
    expect(databaseLockedError).toBe(true);
    
})
