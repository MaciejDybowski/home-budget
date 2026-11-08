import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { parse } from "@vue/compiler-sfc";

const root = resolve(import.meta.dirname, "..");
const en = JSON.parse(readFileSync(resolve(root, "src/i18n/en.json"), "utf8"));
const errors = JSON.parse(
  readFileSync(resolve(root, "src/i18n/errors.en.json"), "utf8"),
);
const pl = JSON.parse(readFileSync(resolve(root, "src/i18n/pl.json"), "utf8"));
const catalog = { ...en, ...errors };
const slots = (text) =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))]
    .sort()
    .join(",");
const problems = [];
for (const [key, value] of Object.entries(en)) {
  if (!value.trim()) problems.push(`Empty English message: ${key}`);
  if (slots(key) !== slots(value))
    problems.push(`Placeholder mismatch: ${key}`);
}
for (const key of Object.keys(pl))
  if (!catalog[key])
    problems.push(`Polish override has no English message: ${key}`);
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(dir, entry.name))
      : [resolve(dir, entry.name)],
  );
function check(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "tr") {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first) && !catalog[first.text])
        problems.push(`Unknown message in ${file}: ${first.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
for (const file of files(resolve(root, "src")).filter((file) =>
  /\.(ts|vue)$/.test(file),
)) {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".vue")) {
    const { descriptor } = parse(source);
    for (const block of [
      descriptor.scriptSetup,
      descriptor.script,
      descriptor.template,
    ])
      if (block) check(block.content, file);
  } else check(source, file);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `EN/PL messages checked: ${Object.keys(catalog).length} messages, placeholders and source references.`,
);
