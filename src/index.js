import { handleSubmitA2P } from "./api/submit-a2p.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/submit-a2p" && request.method === "POST") {
      return handleSubmitA2P(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
