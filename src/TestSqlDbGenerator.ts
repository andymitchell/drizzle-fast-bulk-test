
import * as path from 'path';
import type { Config } from "drizzle-kit";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from '@libsql/client';
import { migrate as migratePg } from "drizzle-orm/pglite/migrator";
import { migrate as migrateLibsql } from 'drizzle-orm/libsql/migrator';
import { drizzle as drizzlePg, PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzleLibsql, LibSQLDatabase } from 'drizzle-orm/libsql';
import {BetterSQLite3Database, drizzle as drizzleBetterSqlite} from 'drizzle-orm/better-sqlite3';
import { migrate as migrateBetterSqlite} from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { fileIoSyncNode } from "@andyrmitchell/file-io";
import { QueueMemory, uid } from '@andyrmitchell/utils';

import { CommonDatabases, SchemaFormatDefault, TestDatabases, TestSqlDb, TestSqlDbGeneratorOptions } from './types';
import { ensureDir } from './ensureDir';




function clearDir(testDir:string):void {


    if( fileIoSyncNode.has_directory(testDir) ) {
        fileIoSyncNode.remove_directory(testDir, true);
    }

}


let instanceCount = 0;



/**
 * Map
 * 
 * Because annoyingly, Drizzle's dialects are different between drizzle-orm and drizzle-kit. 
 */
const COMMON_DATABASES_TO_DRIZZLEKIT_DIALECT:Record<CommonDatabases, "sqlite" | "postgresql" | "mysql" | "turso"> = {
    'pg': 'postgresql',
    'sqlite': 'sqlite',
    'sqlite-bettersqlite3': 'sqlite',
    'sqlite-libsql': 'sqlite'
}

/**
 * It's slow to spin up Pglite, and it's slow to call Drizzle Generate. 
 * This batch creates many partitioned tables (using a unique StoreID for each) in the database in one go (if possible), and offers them out per test. 
 * 
 * Note it doesn't create a schema per test, because Sqlite can't do schemas.
 */
export class TestSqlDbGenerator<D extends CommonDatabases = CommonDatabases, SF = SchemaFormatDefault> {

    #queue = new QueueMemory('');
    #testDbs:TestSqlDb<D, SF>[] = [];
    #testDirAbsolutePath: string;
    #options:TestSqlDbGeneratorOptions<SF>;
    #batchCount = 0;
    

    constructor(testDirAbsolutePath:string, options:TestSqlDbGeneratorOptions) {
        this.#testDirAbsolutePath = testDirAbsolutePath;
        this.#options = options;
    }

    async #migrateBatch() {
        let batchSize = this.#options.batch_size;
        const testDirAbsolutePath = `${this.#testDirAbsolutePath}/b${this.#batchCount++}_${uid()}`;

        clearDir(testDirAbsolutePath)
        await ensureDir(testDirAbsolutePath);


        let partitions:{batch_position: number}[] = [];
        for( let i = 0; i < batchSize; i++ ) {
            partitions.push({
                batch_position: i
            });

        }

        // Create the schema definition file
        let schemaFileAbsolutePaths:string[] = [];
        const result = await this.#options.generate_schemas_for_batch(partitions.map(x => x.batch_position), testDirAbsolutePath);
        const partitionsWithSchemas = result.partitioned_schemas;
        schemaFileAbsolutePaths = [result.migration_file_absolute_path];


        //const schemaFileAbsolutePath = createSchemaDefinitionFile<I>(testDirAbsolutePath, partitions.map(x => x.store_id), this.#implementation);
        const drizzlePaths = createDrizzleConfigFile(testDirAbsolutePath, this.#options.dialect, schemaFileAbsolutePaths); // partitions.map(x => x.absolute_path)


        // Let drizzle generate the SQL for all the schemas and tables 
        runDrizzleKit(testDirAbsolutePath, drizzlePaths.config_path);


        // Generate the db: 
        let db:PgliteDatabase<any> | LibSQLDatabase | BetterSQLite3Database;
        switch(this.#options.dialect) {
            case 'pg':
                db = await setupTestPgDb(drizzlePaths.migration_path);
                break;
            case 'sqlite':
            case 'sqlite-bettersqlite3':
                db = await setupTestSqliteDbBetterSqlite3(testDirAbsolutePath, drizzlePaths.migration_path);
                break;
            case 'sqlite-libsql':
                db = await setupTestSqliteDbLibSql(testDirAbsolutePath, drizzlePaths.migration_path);
                break;
            default: 
                throw new Error("Unknown impl.dialect");
        }


        // Add the schema definitions
        partitionsWithSchemas.forEach(x => {
            this.#testDbs.push({
                db: db as TestDatabases[D],
                ...x,
                instance_id: instanceCount++
            })
        });


    }


    async nextTest() {

        return this.#queue.enqueue(async () => {
            let firstAvailable = this.#testDbs.find(x => !x.used);
            if( !firstAvailable ) {
                await this.#migrateBatch();
                firstAvailable = this.#testDbs.find(x => !x.used);
                if( !firstAvailable ) throw new Error("noop - firstAvailable should be present. Race condition?");
            }

            firstAvailable.used = true;
            return firstAvailable;
        })

        
    }
}



function createDrizzleConfigFile(testDirAbsolutePath:string, dialect:CommonDatabases, schemaFileAbsolutePaths:string[]) {

    


    schemaFileAbsolutePaths = schemaFileAbsolutePaths.map(fp => {
        return fileIoSyncNode.relative(testDirAbsolutePath, fp);
    })


    const targetFile = path.join(testDirAbsolutePath, `drizzle.config.ts`);
    const migrationPath = path.join(testDirAbsolutePath, `drizzle`);

    // FYI Paths relative to drizzle.config.ts work here because when drizzle-kit is invoked, its working directory is set to testDirAbsolutePath (i.e. where drizzle.config.ts is)
    const drizzleConfig:Config = {
        dialect: COMMON_DATABASES_TO_DRIZZLEKIT_DIALECT[dialect],
        schema: schemaFileAbsolutePaths,
        out: fileIoSyncNode.relative(testDirAbsolutePath, migrationPath)
    }



    fileIoSyncNode.write(targetFile, `
import { defineConfig } from "drizzle-kit";

export default defineConfig(${JSON.stringify(drizzleConfig, undefined, 4)});
                `.trim(), {overwrite: true});

    return {config_path: targetFile, migration_path: migrationPath};

}

function runDrizzleKit(testDirAbsolutePath:string, drizzleConfigFileAbsolutePath:string) {
    const configPath = fileIoSyncNode.relative(testDirAbsolutePath, drizzleConfigFileAbsolutePath);
    fileIoSyncNode.execute(`npx drizzle-kit generate --config="${configPath}"`, false, {cwd: testDirAbsolutePath, encoding: 'utf8'});
}




async function setupTestPgDb(migrationsFolder: string, existingDb?: PgliteDatabase<any>) {
    let db:PgliteDatabase<any>;
    if( existingDb ) {
        db = existingDb;
    } else {
        const client = new PGlite();
        db = drizzlePg(client);
    }

    
    await migratePg(db, {
        'migrationsFolder': migrationsFolder
    });
    

    return db;
}

export async function setupTestSqliteDbLibSql(testDirAbsolutePath:string, migrationsFolder?: string) {
    
    
    

    const url = `file:${testDirAbsolutePath}/test-${uid()}.db` // Switched to eliminate possible resets with connection drops 

    const preClient = createClient({
        url
    });

    // Reduces the chance of a "database is locked" collision, especially around transactions 
    await preClient.execute('PRAGMA journal_mode = WAL;'); // Speeds things up 
    
    
    preClient.close();

    const client = createClient({
        url
    });

    const result = await client.execute('PRAGMA journal_mode;');
    if( result.rows[0]!.journal_mode!=='wal' ) {
        throw new Error("Expected WAL mode to be active")
    }

    await client.execute('PRAGMA busy_timeout = 5000;'); // Allows it to retry rather than instantly failing 

    const db = drizzleLibsql(client);
    

    if (migrationsFolder) {
        await migrateLibsql(db, {
            'migrationsFolder': migrationsFolder
        });
    }

    return db;
}



export async function setupTestSqliteDbBetterSqlite3(testDirAbsolutePath:string, migrationsFolder?: string) {
    

    const url = `${testDirAbsolutePath}/test-${uid()}.db` // Switched to eliminate possible resets with connection drops 


    const client = new Database(url, {timeout: 5000});
    client.pragma('journal_mode = WAL')

    const db = drizzleBetterSqlite({client});

    if (migrationsFolder) {
        await migrateBetterSqlite(db, {
            'migrationsFolder': migrationsFolder
        });
    }

    return db;
}

