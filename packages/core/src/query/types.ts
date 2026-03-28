export type QueryCommand = "one" | "many" | "exec" | "execrows" | "execresult";

export interface QueryParam {
  index: number;
  name: string;
  sqlType: string;
}

export interface QueryDef {
  name: string;
  command: QueryCommand;
  sql: string;
  params: QueryParam[];
  returnsTable: string | null;
  returnsColumns: string[];
  sourceFile: string;
}
