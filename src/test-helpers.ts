import { fileIoSyncNode } from "@andyrmitchell/file-io";
import { createSchemaDefinitionFile } from "./createSchemaDefinitionFile";
import { testTableCreatorPg, TestTablePg } from "./test-table.pg";
import { testTableCreatorSqlite, TestTableSqlite } from "./test-table.sqlite";
import { TestSqlDbGenerator } from "./TestSqlDbGenerator";
import { CommonDatabases } from "./types";
import { fileURLToPath } from 'url';



export function createTestSqlDbGenerators(testDir:string, dialect:'pg'):TestSqlDbGenerator<'pg', TestTablePg>
export function createTestSqlDbGenerators(testDir:string, dialect:'sqlite'):TestSqlDbGenerator<'sqlite-bettersqlite3', TestTableSqlite>
export function createTestSqlDbGenerators(testDir:string, dialect:'sqlite-bettersqlite3'):TestSqlDbGenerator<'sqlite-bettersqlite3', TestTableSqlite>
export function createTestSqlDbGenerators(testDir:string, dialect:'sqlite-libsql'):TestSqlDbGenerator<'sqlite-libsql', TestTableSqlite>;
export function createTestSqlDbGenerators<D extends CommonDatabases>(testDir:string, dialect:D) {
    switch(dialect) {
        case 'pg':
            return new TestSqlDbGenerator<D, TestTablePg>(
                testDir, 
                {
                    dialect,
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
        case 'sqlite-bettersqlite3':
        case 'sqlite-libsql':
            return new TestSqlDbGenerator<D, TestTableSqlite>(
                testDir, 
                {
                    dialect,
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



export function getRelativeTestDir(testScriptMetaUrl: string): string {
    return `${fileIoSyncNode.directory_name(fileURLToPath(testScriptMetaUrl))}/test-schemas`;
}
export function clearDir(testDir: string): void {


    if (fileIoSyncNode.has_directory(testDir)) {
        fileIoSyncNode.remove_directory(testDir, true);
    }

}

