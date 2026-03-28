#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "tsqx",
    description: "Type-safe SQL toolkit",
  },
  subCommands: {
    generate: () => import("./commands/generate").then((m) => m.generate),
  },
  run() {},
});

runMain(main);
