import { cp, mkdir, rm } from "node:fs/promises";
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

console.log(`Built GitHub Pages site at ${outputDirectory}`);
