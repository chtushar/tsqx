import { parseConfig, type Config } from "@tsqx/core";

export type { Config };

export function defineConfig(config: Config): Config {
  const result = parseConfig(config);

  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}
