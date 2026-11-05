import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(projectRoot, "src");
const outputDirectory = resolve(projectRoot, "docs");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(resolve(outputDirectory, "vendor"), { recursive: true });

// Publish only the formatter. The former checker is no longer a website page.
await cp(resolve(sourceDirectory, "formatter"), resolve(outputDirectory, "formatter"), { recursive: true });
await cp(resolve(projectRoot, "node_modules/jszip/dist/jszip.min.js"), resolve(outputDirectory, "vendor/jszip.min.js"));
await writeFile(resolve(outputDirectory, "index.html"), await readFile(resolve(sourceDirectory, "index.html"), "utf8"));

console.log(`Built BAC Color & Page Setup Fixer in ${outputDirectory}`);
