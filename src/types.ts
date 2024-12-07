import type { DdtDialect, DdtDialectDatabaseMap, DdtSqliteDriver } from "@andyrmitchell/drizzle-dialect-types";



export type SchemaFormatDefault = any;

export type TestSqlDb<D extends DdtDialect = DdtDialect, SF = SchemaFormatDefault> = {batch_position: number, instance_id: number, db:DdtDialectDatabaseMap[D], schemas: SF, used?: boolean};


export type TestSqlDbGeneratorOptions<SF = any> = {
    generate_schemas_for_batch: (batchPositions: number[], testDirAbsolutePath:string) => Promise<{
        migration_file_absolute_path: string, 
        partitioned_schemas: {batch_position: number, schemas: SF}[]
    }>,
    batch_size: number,
    dialect: DdtDialect,
    sqlite_driver?: DdtSqliteDriver
}
