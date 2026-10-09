import { handleSubmitA2P } from "./api/submit-a2p.js";
import { handleSubmitWebsite } from "./api/submit-website.js";
import { handleSubmitAssets } from "./api/submit-assets.js";
import { handleUpload } from "./api/upload.js";
import { handleAdminFiles } from "./api/admin-files.js";
import { handleDriveCopyBatch } from "./api/copy-to-drive.js";
import { handleLookupServices } from "./api/lookup-services.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/submit-a2p" && request.method === "POST") {
      return handleSubmitA2P(request, env);
    }
    if (url.pathname === "/api/submit-website" && request.method === "POST") {
      return handleSubmitWebsite(request, env);
    }
    if (url.pathname === "/api/submit-assets" && request.method === "POST") {
      return handleSubmitAssets(request, env);
    }
    if (url.pathname === "/api/lookup-services" && request.method === "GET") {
      return handleLookupServices(request, env, url);
    }
    if (url.pathname.startsWith("/api/upload/")) {
      return handleUpload(request, env, url);
    }
    if (url.pathname.startsWith("/admin/")) {
      return handleAdminFiles(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },

  // Runs in the background: copies uploaded files from R2 into Google Drive.
  async queue(batch, env, ctx) {
    return handleDriveCopyBatch(batch, env);
  }
};
