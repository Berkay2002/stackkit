import { describe, expect, it } from "vitest";

import { createStackkitProgram } from "./index.js";

describe("createStackkitProgram", () => {
  it("exposes the full Stackkit lifecycle command surface", () => {
    const program = createStackkitProgram();

    expect(program.commands.map((command) => command.name())).toEqual([
      "create",
      "init",
      "add",
      "remove",
      "update",
      "migrate",
      "diff",
      "doctor",
      "skills",
      "preset",
      "config"
    ]);
  });

  it("groups nested lifecycle commands by domain", () => {
    const program = createStackkitProgram();

    expect(program.commands.find((command) => command.name() === "skills")?.commands.map((command) => command.name())).toEqual([
      "sync",
      "update"
    ]);
    expect(program.commands.find((command) => command.name() === "preset")?.commands.map((command) => command.name())).toEqual([
      "list",
      "inspect"
    ]);
    expect(program.commands.find((command) => command.name() === "config")?.commands.map((command) => command.name())).toEqual([
      "validate"
    ]);
  });
});
