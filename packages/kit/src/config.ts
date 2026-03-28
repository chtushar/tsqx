import { parseConfig, type Config, type ConfigInput } from "@tsqx/core";

export type { Config, ConfigInput };

export function defineConfig(config: ConfigInput): Config {
  const result = parseConfig(config);

  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}
