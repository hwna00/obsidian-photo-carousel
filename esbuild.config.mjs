import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner = `/*\nTHIS IS A GENERATED/BUNDLED FILE BY ESBUILD\nIf you want to view the source, please visit the GitHub repository of this plugin\n*/`;

const prod = process.argv[2] === "production";

/**
 * NOTE ▶︎ 'embla-carousel' 은 번들에 포함해야 Obsidian 런타임에서 require 오류가 나지 않는다.
 * 따라서 external 배열에서 제외하고, platform 을 'browser' 로 명시한다.
 */
const commonOptions = {
	banner: { js: banner },
	entryPoints: ["main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		// CodeMirror & Lezer 모듈은 Obsidian이 자체 번들로 제공하므로 외부로 유지
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins, // Node 기본 모듈
	],
	platform: "browser", // 👉 Embla 등 브라우저용 코드 선택
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
};

const ctx = await esbuild.context(commonOptions);

if (prod) {
	await ctx.rebuild();
	process.exit(0);
} else {
	await ctx.watch();
	console.log("[esbuild] Watching for changes…");
}
