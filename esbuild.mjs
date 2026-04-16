import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension/extension.ts"],
  bundle: true,
  outfile: "out/extension.cjs",
  external: [
    "vscode",
    "playwright",
  ],
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: !production,
  minify: production,
  treeShaking: true,
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  console.log("Extension bundled to out/extension.cjs");
}
