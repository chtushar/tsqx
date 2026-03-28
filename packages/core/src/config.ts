import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { ConfigError } from "./errors";

const relativePath = z
  .string()
  .refine((v) => v.startsWith("./") || v.startsWith("../"), {
    message: "Must be a relative path starting with './' or '../'",
  })
  .refine((v) => !/[<>:"|?*]/.test(v), {
    message: "Path contains invalid characters",
  })
  .refine((v) => !v.includes("\0"), {
    message: "Path contains null bytes",
  })
  .refine((v) => v.length <= 260, {
    message: "Path exceeds maximum length of 260 characters",
  });

function optionalRelativePath(defaultValue: string) {
  return z.string().default(defaultValue).pipe(relativePath);
}

export const configSchema = z.object({
  dialect: z.enum(["pg"]),
  queries: optionalRelativePath("./queries"),
  migrations: optionalRelativePath("./migrations"),
  schema: optionalRelativePath("./schema"),
});

export type ConfigInput = z.input<typeof configSchema>;
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
