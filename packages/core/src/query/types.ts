export type QueryCommand = "one" | "many" | "exec" | "execrows" | "execresult";

export interface QueryParam {
  index: number;
  name: string;
  sqlType: string;
  nullable: boolean;
}

export interface MixinDef {
  name: string;
  params: Array<{ name: string; nullable: boolean; sqlType?: string }>;
  body: string;
  sourceFile: string;
}

export interface QueryDef {
  name: string;
  command: QueryCommand;
  sql: string;
  expandedSql: string;
  params: QueryParam[];
  returnsTable: string | null;
  returnsColumns: string[];
  sourceFile: string;
}
