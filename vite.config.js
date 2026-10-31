import { defineConfig } from "vite";

// Minimal config: dev server reachable on the network (host: true).
// No plugins, no custom build options — the project is plain ES modules
// with the only runtime dependency being three.
export default defineConfig({
  server: {
    host: true,
  },
});
