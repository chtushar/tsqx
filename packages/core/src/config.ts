import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { ConfigError } from "./errors";

export const configSchema = z.object({
  dialect: z.enum(["pg"]),
  queries: z.string(),
  migrations: z.string(),
  schema: z.string(),
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): Result<Config, ConfigError> {
  const result = configSchema.safeParse(raw);

  if (!result.success) {
    return err(
      new ConfigError(
        `Invalid config: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        result.error,
      ),
    );
  }

  return ok(result.data);
}
