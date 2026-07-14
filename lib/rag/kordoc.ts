import type { IRBlock } from "kordoc";

type KordocModule = typeof import("kordoc");

// tsx transpiles static imports to CJS in worker mode, but kordoc's CJS bundle is
// not loadable on Node 22. Keep this as native ESM import for both app and worker.
const importKordoc = new Function("return import('kordoc')") as () => Promise<KordocModule>;

let modulePromise: Promise<KordocModule> | undefined;

function loadKordoc() {
  modulePromise ??= importKordoc();
  return modulePromise;
}

export async function parseKordoc(input: ArrayBuffer) {
  const { parse } = await loadKordoc();
  return parse(input);
}

export async function blocksToKordocMarkdown(blocks: IRBlock[]) {
  const { blocksToMarkdown } = await loadKordoc();
  return blocksToMarkdown(blocks);
}
