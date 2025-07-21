import type { DdtDialect, DdtDialectDatabaseMap } from "@andyrmitchell/drizzle-dialect-types";
import type { PGlite } from "@electric-sql/pglite";
import type { Client } from "@libsql/client";
import type { Database } from "better-sqlite3";
import type postgres from "postgres";



export type SchemaFormatDefault = any;



type Db = {
    dialect: 'pg',
    driver: 'pglite',
    client: PGlite
} | {
    dialect: 'pg',
    driver: 'postgres',
    client: postgres.Sql<{}>
} | {
    dialect: 'sqlite',
    driver: 'libsql',
    client: Client
} | {
    dialect: 'sqlite',
    driver: 'better-sqlite3',
    client: Database
}
export type ExpectedDb = Omit<Db, 'client'>;

type CreatedDbExtras<D extends DdtDialect> = {
    /**
     * Use the client to terminate the database connection
     * @returns 
     */
    closeConnection: () => Promise<void>,

    db: DdtDialectDatabaseMap[D]

}
export type CreatedDb = Db & CreatedDbExtras<any>;
export type CreatedDbByDialect<D extends DdtDialect> = DbByDialect<D> & CreatedDbExtras<D>;
export type CreatedDbByDialectAndDriver<D extends DdtDialect, DR extends DdtDialectDriver> = DbByDialectAndDriver<D, DR> & CreatedDbExtras<D>;
type DbByDialect<D extends DdtDialect> = Extract<Db, { dialect: D }>;
export type DdtDialectDriver = Db['driver'];
type DbByDialectAndDriver<D extends DdtDialect, DR extends DdtDialectDriver> = Extract<Db, { dialect: D, driver: DR }>;



export type TestSqlDb<D extends DdtDialect = DdtDialect, DR extends DdtDialectDriver = DdtDialectDriver, SF = SchemaFormatDefault> = {instance_id: number, used?: boolean} & PartitionedSchema<SF> & CreatedDbByDialectAndDriver<D, DR>;


export type PartitionedSchema<SF> = {
    /**
     * The index in the batch
     */
    batch_position: number, 

    /**
     * The Drizzle schema instances, e.g. the return type of `pg.pgSchema`
     * 
     * This generator isn't opinionated about exactly what they are. In `nextTest` it'll return whatever you gave it. It's the consumer's responsibility to decide the exact format.
     * But it should be table(s) with a name that is unique to the given `batch_position`. E.g. if the generic table name is `accounts` it might be `` `${batch_position}_accounts` ``
     * 
     * Typically it would be something like Record<string, pg.pgSchema>, keyed for each table.
     * 
     */
    schemas: SF
}

export type DrizzleFastBulkTestGeneratorOptions<SF = any> = {

    /**
     * Generate schemas for a batch of isolated test database partitions.
     * 
     * This function is responsible for generating multiple versions of the same base schema,
     * each uniquely partitioned for use in parallel or sequential isolated tests.
     * 
     * Note it's not opinionated about the exact format of the returned 'schemas' in `PartitionedSchema`. It will accept anything and return it to you in nextTest. But it should broadly be Drizzle schema instances for tables with a name unique to the given batch_position.
     * 
     * @param batchPositions The indexes of the partitioned schemas. It will create schemas for each one.
     * @param testDirAbsolutePath 
     * @returns 
     */
    generate_schemas_for_batch: (batchPositions: number[], testDirAbsolutePath:string) => Promise<{
        migration_file_absolute_path: string, 
        partitioned_schemas: PartitionedSchema<SF>[]
    }>,

    batch_size: number,

    db: ExpectedDb

    verbose?: boolean
    
}

