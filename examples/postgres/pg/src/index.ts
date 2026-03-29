import { Pool } from "pg";
import { env } from "node:process";
import {
  DeleteUser,
  GetTraceStats,
  GetUser,
  ListTraces,
  ListUsersPaginated,
} from "@db/queries";

const pg = new Pool({
  connectionString: env.DATABASE_URL!,
});

ListUsersPaginated(pg, {
  limit: 1,
  offset: 2,
});

DeleteUser(pg, {
  id: 1,
});
