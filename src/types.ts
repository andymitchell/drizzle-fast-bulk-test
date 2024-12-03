import { LibSQLDatabase } from "drizzle-orm/libsql";
import { PgliteDatabase } from "drizzle-orm/pglite";

export type TestDatabases = {
    'pg': PgliteDatabase,
    'sqlite': LibSQLDatabase
}

export type CommonDatabases = "sqlite" | "pg";

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
