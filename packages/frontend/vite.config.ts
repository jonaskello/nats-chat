import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

export default defineConfig({
  clearScreen: false,
  plugins: [checker({ typescript: { buildMode: true } })],
  server: {
    host: "0.0.0.0",
    port: 3040,
    proxy: {
      "/nats": { target: "http://127.0.0.1:9228", secure: false, ws: true },
      "/login": { target: "http://127.0.0.1:3050", secure: false },
      "/logout": { target: "http://127.0.0.1:3050", secure: false },
    },
  },
});
