// Direct codama script - bypasses CLI path issues on Windows
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { readFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generate(idlPath, outDir) {
  const idl = JSON.parse(readFileSync(join(__dirname, idlPath), "utf8"));
  mkdirSync(join(__dirname, outDir), { recursive: true });
  const codama = createFromRoot(rootNodeFromAnchor(idl));
  await codama.accept(renderVisitor(join(__dirname, outDir)));
  console.log(`✔ Generated: ${outDir}`);
}

await generate(
  "anchor/target/idl/vault.json",
  "app/generated/vault"
);
await generate(
  "anchor/target/idl/ulysses_protocol.json",
  "app/generated/ulysses-protocol"
);
