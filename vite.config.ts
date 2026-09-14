import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Injects the analytics <script> tag only when both VITE_ANALYTICS_ENDPOINT and
 * VITE_ANALYTICS_WEBSITE_ID are actually set. Without this guard, Vite's %VAR%
 * HTML interpolation leaves the literal "%VITE_ANALYTICS_ENDPOINT%" string in the
 * page (e.g. in local dev, where these are unset), which the browser then requests
 * as a relative path -- crashing Express's router with a malformed URI error.
 */
function vitePluginAnalytics(env: Record<string, string>): Plugin {
  return {
    name: "analytics-script-injector",
    transformIndexHtml(html) {
      const endpoint = env.VITE_ANALYTICS_ENDPOINT;
      const websiteId = env.VITE_ANALYTICS_WEBSITE_ID;
      if (!endpoint || !websiteId) {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              defer: true,
              src: `${endpoint}/umami`,
              "data-website-id": websiteId,
            },
            injectTo: "body",
          },
        ],
      };
    },
  };
}

const envDir = path.resolve(import.meta.dirname);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      vitePluginAnalytics(env),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir,
    root: path.resolve(import.meta.dirname, "client"),
    publicDir: path.resolve(import.meta.dirname, "client", "public"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      host: true,
      allowedHosts: ["localhost", "127.0.0.1"],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
