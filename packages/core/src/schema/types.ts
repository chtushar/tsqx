export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  primaryKey: boolean;
  unique: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface TableConstraint {
  type: "primary_key" | "unique" | "foreign_key";
  name?: string;
  columns: string[];
  references?: {
    table: string;
    columns: string[];
  };
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  constraints: TableConstraint[];
}

export type SchemaSnapshot = Record<string, TableDef>;

export type Operation =
  | { type: "create_table"; table: TableDef }
  | { type: "drop_table"; tableName: string }
  | { type: "add_column"; tableName: string; column: ColumnDef }
  | { type: "drop_column"; tableName: string; columnName: string }
  | {
      type: "alter_column";
      tableName: string;
      columnName: string;
      from: ColumnDef;
      to: ColumnDef;
    };

export interface GenerateResult {
  migrationFile: string | null;
  operations: Operation[];
  snapshotUpdated: boolean;
}
