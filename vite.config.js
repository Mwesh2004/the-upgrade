import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        portal: "portal.html",
        privacy: "privacy.html",
        terms: "terms.html",
        disclaimer: "disclaimer.html",
        contact: "contact.html"
      }
    }
  }
});