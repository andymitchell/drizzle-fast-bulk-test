
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";



export function testTableCreatorPg(id:string) {

    return pg.pgTable("test_table_"+id, {
        id: pg.integer().primaryKey().generatedAlwaysAsIdentity(),
        name: pg.text().notNull(),
        age: pg.integer()
    }, (table) => [
    ])
}


export type TestTableCreatorPg = typeof testTableCreatorPg;
export type TestTablePg = ReturnType<TestTableCreatorPg>;
export type TestTableSelectPg = InferSelectModel<TestTablePg>;
export type TestTableInsertPg = InferInsertModel<TestTablePg>;


