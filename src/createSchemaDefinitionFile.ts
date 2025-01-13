import { fileIoSyncNode, getPackageDirectorySync } from "@andyrmitchell/file-io";
import * as path from 'path';

type Options = {
    /**
     * The directory to create the schema file in
     */
    test_dir_absolute_path: string, 

    table_creator_import: {
        /**
         * Find another file, and make sure it's imported (relative to the final file)
         */
        link_file_pattern: RegExp | string, 

        /**
         * The exported items to import from the linked file
         * 
         * Fits this pattern: import <import_from_link_file> from 'linked_file'
         * 
         * @example {tableCreator}
         * 
         */
        import_name:string,
    },

    

    

    /**
     * The string form of a function that accepts a storeId and returns a Drizzle table. 
     * 
     * It's most likely a function in the import file you referenced in link_file_pattern
     * 
     * @param storeIds
     * @returns The string form of a function. E.g. tableCreator('storeId1'); tableCreator('storeId2')
     */
    table_creator_invocation: (storeIds:string[]) => string
}

/**
 * Generate a schema definition file for testing. 
 * 
 * It imports a table generator file, and for each store id it exports a schema. 
 * 
 * @param options 
 * @param storeIds Create a schema for each entry in a batch
 * @returns 
 */
export function createSchemaDefinitionFile(options:Options, storeIds: string[], extension: '.ts' | '.js' | '' = '.ts') {

    // Get the package root that will contain sqlSchemaCreator.ts, then find it
    const rootDir = getPackageDirectorySync({
        target: 'closest-directory',
        dir: options.test_dir_absolute_path
    });
    
    const file_pattern = options.table_creator_import.link_file_pattern instanceof RegExp? options.table_creator_import.link_file_pattern : new RegExp(options.table_creator_import.link_file_pattern);
    const files = fileIoSyncNode.list_files(rootDir, {recurse: true, file_pattern});
    const sqlSchemaCreatorFile = files[0]!;

    const importUrl = fileIoSyncNode.relative(options.test_dir_absolute_path, sqlSchemaCreatorFile.uri);

    let content = `
import ${options.table_creator_import.import_name} from "${importUrl.replace(/\.(t|j)s$/, '')}${extension}";

${options.table_creator_invocation(storeIds)}

    `.trim();


    const storeIdName = storeIds.length===1? storeIds[0] : `${storeIds[0]}-${storeIds[storeIds.length-1]}`;
    const schemaFileName = `schema_${storeIdName}.ts`;
    const targetFile = path.join(options.test_dir_absolute_path, schemaFileName);
    
    fileIoSyncNode.write(targetFile, content, {overwrite: true});

    return targetFile;

}