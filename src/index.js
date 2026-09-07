import { handleSubmitA2P } from "./api/submit-a2p.js";
import { handleSubmitWebsite } from "./api/submit-website.js";
import { handleSubmitAssets } from "./api/submit-assets.js";

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

    return env.ASSETS.fetch(request);
  }
};
