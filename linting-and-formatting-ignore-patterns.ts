export const ignorePatterns: string[] = [
  "*.min.css",
  "/__snapshots__/",
  "/docs/js/",
  "/docs/js/",
  "/examples/timeline/other/requirejs/scripts/require.js",
  // Build outputs are committed in this fork (consumed via the git
  // submodule) but stay generated code - lint the sources in lib/ instead.
  "/esnext/",
  // Everything from gitignore is implicitly ignored.
];
