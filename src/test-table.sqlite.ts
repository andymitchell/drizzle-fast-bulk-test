
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import * as sqlite from "drizzle-orm/sqlite-core"; 



export function testTableCreatorSqlite(id:string) {

    return sqlite.sqliteTable("test_table_"+id, {
        id: sqlite.integer("id").primaryKey({ autoIncrement: true }),
        name: sqlite.text().notNull(),
        age: sqlite.integer()
    }, (table) => ({
    }))
}


export type TestTableCreatorSqlite = typeof testTableCreatorSqlite;
export type TestTableSqlite = ReturnType<TestTableCreatorSqlite>;
export type TestTableSelectSqlite = InferSelectModel<TestTableSqlite>;
export type TestTableInsertSqlite = InferInsertModel<TestTableSqlite>;


