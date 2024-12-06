import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { PgDatabase } from "drizzle-orm/pg-core";
import { PgliteDatabase } from "drizzle-orm/pglite";

export type TestDatabases = {
    'pg': PgliteDatabase | PgDatabase<any>,
    'sqlite': LibSQLDatabase | BetterSQLite3Database
}

export const COMMON_DATABASES = ["sqlite", "pg"] as const;
export type CommonDatabases = typeof COMMON_DATABASES[number];

export type SchemaFormatDefault = any;

export type TestSqlDb<D extends CommonDatabases = CommonDatabases, SF = SchemaFormatDefault> = {batch_position: number, instance_id: number, db:TestDatabases[D], schemas: SF, used?: boolean};

export type SqliteDriverOptions = 'better-sqlite3' | 'libsql';
export type TestSqlDbGeneratorOptions<SF = any> = {
    generate_schemas_for_batch: (batchPositions: number[], testDirAbsolutePath:string) => Promise<{
        migration_file_absolute_path: string, 
        partitioned_schemas: {batch_position: number, schemas: SF}[]
    }>,
    batch_size: number,
    dialect: CommonDatabases,
    sqlite_driver?: SqliteDriverOptions
}
