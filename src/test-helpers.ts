import { removeDirectorySync, thisDir } from "@andyrmitchell/file-io";
import { createSchemaDefinitionFile } from "./createSchemaDefinitionFile.js";
import { testTableCreatorPg, type TestTablePg } from "./test-table.pg.js";
import { testTableCreatorSqlite, type TestTableSqlite } from "./test-table.sqlite.js";
import { DrizzleFastBulkTestGenerator } from "./DrizzleFastBulkTestGenerator.js";

import { fileURLToPath } from 'url';
import type { DdtDialect } from "@andyrmitchell/drizzle-dialect-types";
import type { DdtDialectDriver } from "./types.js";
import { dirname } from "path";
import { existsSync } from "fs";



export function createDrizzleFastBulkTestGenerators(testDir:string, dialect:'pg', driver: 'pglite'):DrizzleFastBulkTestGenerator<'pg', 'pglite', TestTablePg>
export function createDrizzleFastBulkTestGenerators(testDir:string, dialect:'pg', driver: 'postgres'):DrizzleFastBulkTestGenerator<'pg', 'postgres', TestTablePg>
export function createDrizzleFastBulkTestGenerators(testDir:string, dialect:'sqlite', driver: 'libsql'):DrizzleFastBulkTestGenerator<'sqlite', 'libsql', TestTablePg>
export function createDrizzleFastBulkTestGenerators(testDir:string, dialect:'sqlite', driver: 'better-sqlite3'):DrizzleFastBulkTestGenerator<'sqlite', 'better-sqlite3', TestTablePg>
export function createDrizzleFastBulkTestGenerators<D extends DdtDialect, DR extends DdtDialectDriver>(testDir:string, dialect:D, driver: DR) {
    switch(dialect) {
        case 'pg':
            return new DrizzleFastBulkTestGenerator<D, DR, TestTablePg>(
                testDir, 
                {
                    db: {
                        dialect,
                        driver
                    },
                    batch_size: 5,
                    generate_schemas_for_batch: async (batchPositions, batchTestDirAbsolutePath) => {
                        
                        const partitioned_schemas = batchPositions.map(batch_position => {
                            const storeId = `store${batch_position}`;
                            return {
                                batch_position,
                                store_id: storeId,
                                schemas: testTableCreatorPg(storeId)
                            }
                        })
            
                        const migration_file_absolute_path = createSchemaDefinitionFile({
                            test_dir_absolute_path: batchTestDirAbsolutePath,
                            table_creator_import: {
                                link_file_pattern: 'test-table.pg.ts',
                                import_name: '{testTableCreatorPg}',
                            },
                            table_creator_invocation: (storeIds)  => {
            
                                return storeIds.map(storeId => `export const store_${storeId} = testTableCreatorPg('${storeId}');`).join("\n")
                                
                            },
                        }, partitioned_schemas.map(x => x.store_id));
            
                        return {
                            partitioned_schemas,
                            migration_file_absolute_path
                        }
                    }
                }
            );
        case 'sqlite':
            return new DrizzleFastBulkTestGenerator<D, DR, TestTableSqlite>(
                testDir, 
                {
                    db: {
                        dialect,
                        driver
                    },
                    batch_size: 5,
                    generate_schemas_for_batch: async (batchPositions, batchTestDirAbsolutePath) => {
                        
                        const partitioned_schemas = batchPositions.map(batch_position => {
                            const storeId = `store${batch_position}`;
                            return {
                                batch_position,
                                store_id: storeId,
                                schemas: testTableCreatorSqlite(storeId)
                            }
                        })
            
                        const migration_file_absolute_path = createSchemaDefinitionFile({
                            test_dir_absolute_path: batchTestDirAbsolutePath,
                            table_creator_import: {
                                link_file_pattern: 'test-table.sqlite.ts',
                                import_name: '{testTableCreatorSqlite}',
                            },
                            table_creator_invocation: (storeIds)  => {
            
                                return storeIds.map(storeId => `export const store_${storeId} = testTableCreatorSqlite('${storeId}');`).join("\n")
                                
                            },
                        }, partitioned_schemas.map(x => x.store_id));
            
                        return {
                            partitioned_schemas,
                            migration_file_absolute_path
                        }
                    }
                }
            )
    


    }
    
    
}



export function getRelativeTestDir(testScriptMetaUrl: string, subDir = 'test-schemas'): string {
    return `${thisDir(testScriptMetaUrl)}/${subDir}`;
}
export function clearDir(testDir: string): void {


    removeDirectorySync(testDir, true);

}

