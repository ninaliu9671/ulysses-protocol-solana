// One-shot Codama regen for vault IDL → app/generated/vault.
// Workaround for codama config loader's Windows path bug.
import { readFileSync } from 'fs';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { createFromRoot } from 'codama';
import { renderVisitor } from '@codama/renderers-js';

const idl = JSON.parse(readFileSync('./anchor/target/idl/vault.json', 'utf8'));
const codama = createFromRoot(rootNodeFromAnchor(idl));
codama.accept(renderVisitor('./app/generated/vault'));
console.log('✔ generated app/generated/vault');
