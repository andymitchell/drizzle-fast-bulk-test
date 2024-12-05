import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { PgliteDatabase } from "drizzle-orm/pglite";

export type TestDatabases = {
    'pg': PgliteDatabase,
    'sqlite': LibSQLDatabase | BetterSQLite3Database,
    'sqlite-bettersqlite3': BetterSQLite3Database
    'sqlite-libsql': LibSQLDatabase
}

export const COMMON_DATABASES = ["sqlite", "pg", "sqlite-bettersqlite3", "sqlite-libsql"] as const;
export type CommonDatabases = typeof COMMON_DATABASES[number];

export type SchemaFormatDefault = any;

export type TestSqlDb<D extends CommonDatabases = CommonDatabases, SF = SchemaFormatDefault> = {batch_position: number, instance_id: number, db:TestDatabases[D], schemas: SF, used?: boolean};

export type TestSqlDbGeneratorOptions<SF = any> = {
    generate_schemas_for_batch: (batchPositions: number[], testDirAbsolutePath:string) => Promise<{
        migration_file_absolute_path: string, 
        partitioned_schemas: {batch_position: number, schemas: SF}[]
    }>,
    batch_size: number,
    dialect: CommonDatabases
}
