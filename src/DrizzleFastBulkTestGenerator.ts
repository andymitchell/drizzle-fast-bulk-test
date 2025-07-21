
import * as path from 'path';
import type { Config } from "drizzle-kit";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from '@libsql/client';
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { migrate as migrateLibsql } from 'drizzle-orm/libsql/migrator';
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { drizzle as drizzleBetterSqlite} from 'drizzle-orm/better-sqlite3';
import { migrate as migrateBetterSqlite} from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { fileIoSyncNode } from "@andyrmitchell/file-io";
import { QueueMemory } from '@andyrmitchell/utils/queue';
import { uid } from '@andyrmitchell/utils/uid';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from "@testcontainers/postgresql";


import type {  SchemaFormatDefault, TestSqlDb, DrizzleFastBulkTestGeneratorOptions, CreatedDbByDialectAndDriver, DdtDialectDriver } from './types.js';
import {ensureDir} from 'fs-extra';
import { DDT_DIALECT_TO_DRIZZLEKIT_DIALECT, type DdtDialect } from '@andyrmitchell/drizzle-dialect-types';
import postgres from 'postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sleep } from '@andyrmitchell/utils';




function clearDir(testDir:string):void {


    if( fileIoSyncNode.has_directory(testDir) ) {
        fileIoSyncNode.remove_directory(testDir, true);
    }

}


let instanceCount = 0;




/**
 * Often tests need to work off the same baseline schema (e.g. PostgresRmw in Store which uses a single 'objects' schema for 100s of tests).
 * 
 * It's slow to spin up a Postgres DB (Pglite or Test Container's Postgres) per test, and it's slow to call Drizzle Kit "generate". 
 * 
 * This will bulk create many 'databases' with the same schema. 
 * 
 * ### How it works
 * 
 * It's a trick that the 'database' is really a single real database, where the tables in the schema are cloned with unique names. This effectively creates isolated partitions that are indistinguishable from a separate database. 
 * 
 * Note it doesn't create a schema per test, because Sqlite can't do schemas. Under the hood it's creating table clones with unique names. 
 * 
 * ### The two main functions
 * 
 * `generate_schemas_for_batch` is passed in to the constructor, and for each `batch_position` generates Drizzle schemas instance for the tables (typically by giving them a name prefix that includes `batch_position`)
 * 
 * `nextTest` returns the next unused batch_position Drizzle schemas instance (with it's unique table names). Again, the exact format is up to the consumer.
 */
export class DrizzleFastBulkTestGenerator<D extends DdtDialect = DdtDialect, DR extends DdtDialectDriver = DdtDialectDriver, SF = SchemaFormatDefault> {

    #queue = new QueueMemory('');
    #testDbs:TestSqlDb<D, DR, SF>[] = [];
    #testDirAbsolutePath: string;
    #options:DrizzleFastBulkTestGeneratorOptions<SF>;
    #batchCount = 0;
    

    constructor(testDirAbsolutePath:string, options:DrizzleFastBulkTestGeneratorOptions) {
        this.#testDirAbsolutePath = testDirAbsolutePath;
        this.#options = options;
    }

    async #migrateBatch() {
        if(this.#options.verbose) console.log("migrateBatch");
        let batchSize = this.#options.batch_size;
        const testDirAbsolutePath = `${this.#testDirAbsolutePath}/b${this.#batchCount++}_${uid()}`;

        
        if(this.#options.verbose) console.log("migrateBatch check dir: "+testDirAbsolutePath);
        clearDir(testDirAbsolutePath)
        await sleep(5);
        if(this.#options.verbose) console.log("migrateBatch dir cleared; will now ensureDir");
        await ensureDir(testDirAbsolutePath);
        if(this.#options.verbose) console.log("migrateBatch directories set up");


        let partitions:{batch_position: number}[] = [];
        for( let i = 0; i < batchSize; i++ ) {
            partitions.push({
                batch_position: i
            });

        }

        // Create the schema definition file
        let schemaFileAbsolutePaths:string[] = [];
        if(this.#options.verbose) console.log("migrateBatch callback generate schemas for batch");
        const result = await this.#options.generate_schemas_for_batch(partitions.map(x => x.batch_position), testDirAbsolutePath);
        if(this.#options.verbose) console.log("migrateBatch generated schemas for batch");
        const partitionsWithSchemas = result.partitioned_schemas;
        schemaFileAbsolutePaths = [result.migration_file_absolute_path];


        //const schemaFileAbsolutePath = createSchemaDefinitionFile<I>(testDirAbsolutePath, partitions.map(x => x.store_id), this.#implementation);
        const drizzlePaths = createDrizzleConfigFile(testDirAbsolutePath, this.#options.db.dialect, schemaFileAbsolutePaths); // partitions.map(x => x.absolute_path)


        // Let drizzle generate the SQL for all the schemas and tables 
        runDrizzleKit(testDirAbsolutePath, drizzlePaths.config_path);


        // Generate the db: 
        if(this.#options.verbose) console.log("migrateBatch now generate the db");
        
        let resultDb: CreatedDbByDialectAndDriver<D, DR>;
        //let db:PgliteDatabase<any> | PostgresJsDatabase<any> | LibSQLDatabase | BetterSQLite3Database;
        //let client:DbClient | undefined;
        switch(this.#options.db.dialect) {
            case 'pg':
                if( this.#options.db.driver==='postgres' ) {
                    resultDb = await setupTestPostgresDb(drizzlePaths.migration_path) as CreatedDbByDialectAndDriver<D, DR>;
                    
                } else {
                    resultDb = await setupTestPgliteDb(drizzlePaths.migration_path) as CreatedDbByDialectAndDriver<D, DR>;
                }
                break;
            case 'sqlite':
                if( this.#options.db.driver==='libsql' ) {
                    resultDb = await setupTestSqliteDbLibSql(testDirAbsolutePath, drizzlePaths.migration_path) as CreatedDbByDialectAndDriver<D, DR>;
                } else {
                    resultDb = await setupTestSqliteDbBetterSqlite3(testDirAbsolutePath, drizzlePaths.migration_path) as CreatedDbByDialectAndDriver<D, DR>;
                }
                break;
            default: 
                throw new Error("Unknown impl.dialect");
        }


        //const {db, client, closeConnection} = resultDb;
        // Add the schema definitions
        partitionsWithSchemas.forEach(x => {
            this.#testDbs.push({
                ...x,
                ...resultDb,
                instance_id: instanceCount++
            })
        });


    }


    /**
     * Give access to the shared db, and the specific schemas of the next test (where those schemas are what you made for a single `batch_position` in `generate_schemas_for_batch` )
     * 
     * 
     * @returns 
     */
    async nextTest() {

        if(this.#options.verbose) console.log("nextTest queued");
        return this.#queue.enqueue(async () => {
            if(this.#options.verbose) console.log("nextTest running");
            let firstAvailable = this.#testDbs.find(x => !x.used);
            if( !firstAvailable ) {
                if(this.#options.verbose) console.log("nextTest will now migrateBatch");
                await this.#migrateBatch();
                firstAvailable = this.#testDbs.find(x => !x.used);
                if( !firstAvailable ) throw new Error("noop - firstAvailable should be present. Race condition?");
            }

            if(this.#options.verbose) console.log("nextTest firstAvailable ready");
            firstAvailable.used = true;
            return firstAvailable;
        })

        
    }

    /**
     * Close all database connections (via their clients)
     * @returns 
     */
    async closeAllConnections() {
        return Promise.all(this.#testDbs.map(x => {
            return x.closeConnection()
        }))
    }
}



function createDrizzleConfigFile(testDirAbsolutePath:string, dialect:DdtDialect, schemaFileAbsolutePaths:string[]) {

    


    schemaFileAbsolutePaths = schemaFileAbsolutePaths.map(fp => {
        return fileIoSyncNode.relative(testDirAbsolutePath, fp);
    })


    const targetFile = path.join(testDirAbsolutePath, `drizzle.config.ts`);
    const migrationPath = path.join(testDirAbsolutePath, `drizzle`);

    // FYI Paths relative to drizzle.config.ts work here because when drizzle-kit is invoked, its working directory is set to testDirAbsolutePath (i.e. where drizzle.config.ts is)
    const drizzleConfig:Config = {
        dialect: DDT_DIALECT_TO_DRIZZLEKIT_DIALECT[dialect],
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




async function setupTestPgliteDb(migrationsFolder: string):Promise<CreatedDbByDialectAndDriver<"pg", "pglite">> {

    const client = new PGlite();
    
    const db = drizzlePglite(client);


    
    await migratePglite(db, {
        'migrationsFolder': migrationsFolder
    });
    

    return {dialect: 'pg', driver: 'pglite', db, client, closeConnection: async () => await client.close()};
}


async function setupTestPostgresDb(migrationsFolder: string):Promise<CreatedDbByDialectAndDriver<"pg", "postgres">> {


    let postgresContainer:StartedPostgreSqlContainer;
    try {
        // More at https://hub.docker.com/_/postgres . You can also use 'latest'.
        postgresContainer = await new PostgreSqlContainer('postgres:16.9-alpine').start();
    } catch(e) {
        if( e instanceof Error ) {
            if( e.message.includes('Could not find a working container runtime strategy') ) {
                e.message += ' (Docker must be running)'
            }
        }
        throw e;
    }

    let db:PgDatabase<any>;
    let client:postgres.Sql;
    

    client = postgres(postgresContainer.getConnectionUri());
    db = drizzlePostgres({client});

    // TODO Return client and add it to the batch object. Have a way to dispose all connections in the test (or retrieve them so the outsider can do it).

    await migratePostgres(db, {
        'migrationsFolder': migrationsFolder
    });
    

    return {
        dialect: 'pg',
        driver: 'postgres',
        db,
        client,
        closeConnection: async () => await client.end({timeout: 5})
    };
}

export async function setupTestSqliteDbLibSql(testDirAbsolutePath:string, migrationsFolder?: string):Promise<CreatedDbByDialectAndDriver<"sqlite", "libsql">> {
    
    
    

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

    return {
        dialect: 'sqlite',
        driver: 'libsql',
        db, 
        client,
        closeConnection: async () => client.close()
    };
}



export async function setupTestSqliteDbBetterSqlite3(testDirAbsolutePath:string, migrationsFolder?: string):Promise<CreatedDbByDialectAndDriver<"sqlite", "better-sqlite3">> {
    

    const url = `${testDirAbsolutePath}/test-${uid()}.db` // Switched to eliminate possible resets with connection drops 


    const client = new Database(url, {timeout: 5000});
    client.pragma('journal_mode = WAL')

    const db = drizzleBetterSqlite({client});

    if (migrationsFolder) {
        await migrateBetterSqlite(db, {
            'migrationsFolder': migrationsFolder
        });
    }

    return {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        db, 
        client,
        closeConnection: async () => {
            client.close()
        }
    };
}

