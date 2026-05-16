import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          const normalizedId = id.replaceAll("\\", "/");

          // Three.js is the big stable rendering dependency. Keeping it in its
          // own chunk lets browsers cache renderer code across engine edits and
          // keeps the app chunk focused on code we actually change often.
          if (normalizedId.includes("/node_modules/three/")) return "vendor-three";

          // Leave a small escape hatch for future dependencies without having
          // to revisit this config every time one package gets added.
          if (normalizedId.includes("/node_modules/")) return "vendor";

          return undefined;
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  }
});
