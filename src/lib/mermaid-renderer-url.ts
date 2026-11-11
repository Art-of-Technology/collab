// The bundler copies the prebuilt renderer into the static assets and resolves this to its URL.
// Kept in its own module because `import.meta` exists only in ES modules.
export const rendererUrl = new URL('mermaid/dist/mermaid.min.js', import.meta.url).href;
