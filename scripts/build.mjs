import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(projectRoot, "src");
const outputDirectory = resolve(projectRoot, "docs");
const vendorDirectory = resolve(outputDirectory, "vendor");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(vendorDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
await cp(
  resolve(projectRoot, "node_modules/jszip/dist/jszip.min.js"),
  resolve(vendorDirectory, "jszip.min.js"),
);

const sourceHtml = await readFile(resolve(sourceDirectory, "index.html"), "utf8");
const sourceCss = await readFile(resolve(sourceDirectory, "styles.css"), "utf8");
const stylesheetLink = '  <link rel="stylesheet" href="./styles.css">';
if (!sourceHtml.includes(stylesheetLink)) {
  throw new Error("The expected stylesheet link is missing from src/index.html.");
}
const inlinedHtml = sourceHtml.replace(stylesheetLink, `  <style>\n${sourceCss}\n  </style>`);
await writeFile(resolve(outputDirectory, "index.html"), inlinedHtml, "utf8");

console.log(`Built GitHub Pages site at ${outputDirectory}`);
