import { expect, test } from "bun:test"
import { collapseShellOutput, collapseToolOutput } from "../../../src/util/collapse-tool-output"

test("limits command input and output to the same line budget", () => {
  const command = Array.from({ length: 8 }, (_, index) => `command ${index + 1}`).join("\n")
  const output = Array.from({ length: 4 }, (_, index) => `output ${index + 1}`).join("\n")
  const collapsed = collapseToolOutput(`$ ${command}\n\n${output}`, 10, 1_000)

  expect(collapsed.overflow).toBe(true)
  expect(collapsed.output.split("\n")).toHaveLength(10)
  expect(collapsed.output).toContain("$ command 1")
  expect(collapsed.output).toContain("command 8\n\noutput 1…")
  expect(collapsed.output).not.toContain("output 2")
})

test.each([
  {
    name: "fitting output without a command",
    input: "",
    output: "a\nb",
    lines: 2,
    chars: 3,
    expected: { input: "", output: "a\nb", overflow: false },
  },
  {
    name: "tail line overflow without a command",
    input: "",
    output: "one\ntwo\nthree\nfour",
    lines: 3,
    chars: 100,
    expected: { input: "", output: "(2 earlier lines)\nthree\nfour", overflow: true },
  },
  {
    name: "Unicode tail code-point budget",
    input: "",
    output: "old".repeat(12) + "😀b😺c",
    lines: 3,
    chars: 21,
    expected: { input: "", output: "(1 earlier line)\n😀b😺c", overflow: true },
  },
  {
    name: "one-line output budget",
    input: "",
    output: "one\ntwo\nthree",
    lines: 1,
    chars: 100,
    expected: { input: "", output: "(3 earlier lines)", overflow: true },
  },
  {
    name: "empty output with zero budgets",
    input: "",
    output: "",
    lines: 0,
    chars: 0,
    expected: { input: "", output: "(1 earlier line)", overflow: true },
  },
  {
    name: "zero line budget",
    input: "",
    output: "abc",
    lines: 0,
    chars: 10,
    expected: { input: "", output: "(1 earlier line)", overflow: true },
  },
  {
    name: "fitting command and output",
    input: "echo",
    output: "done",
    lines: 3,
    chars: 100,
    expected: { input: "echo", output: "done", overflow: false },
  },
  {
    name: "command-only line overflow",
    input: "a\nb\nc",
    output: "",
    lines: 3,
    chars: 100,
    expected: { input: "a\nb…", output: "", overflow: true },
  },
  {
    name: "command-only character overflow",
    input: "abcdef",
    output: "",
    lines: 1,
    chars: 4,
    expected: { input: "abc…", output: "", overflow: true },
  },
  {
    name: "command reserves output lines",
    input: "echo",
    output: "one\ntwo\nthree\nfour",
    lines: 5,
    chars: 100,
    expected: { input: "echo", output: "(2 earlier lines)\nthree\nfour", overflow: true },
  },
  {
    name: "combined command and output overflow",
    input: "abcdefghijkl",
    output: "one\ntwo",
    lines: 3,
    chars: 12,
    expected: { input: "abcdefg…", output: "(2 earlier lines)", overflow: true },
  },
  {
    name: "command overflow with fitting output",
    input: "a\nb\nc",
    output: "ok",
    lines: 4,
    chars: 100,
    expected: { input: "a\nb…", output: "ok", overflow: true },
  },
  {
    name: "command grapheme display-width overflow",
    input: "😀😀😀",
    output: "tail",
    lines: 2,
    chars: 6,
    expected: { input: "😀😀…", output: "(1 earlier line)", overflow: true },
  },
])("shell preview preserves $name", ({ input, output, lines, chars, expected }) => {
  expect(collapseShellOutput(input, output, lines, chars)).toEqual(expected)
})
