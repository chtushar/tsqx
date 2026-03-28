import { Pool } from "pg";
import { env } from "node:process";
import { GetUser } from "@db/queries";

const pg = new Pool({
  connectionString: env.DATABASE_URL!,
});

GetUser(pg, {
  id: 1,
});
