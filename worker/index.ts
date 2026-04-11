/**
 * Cloudflare Worker: serve static assets from `dist-web` (see wrangler.toml [assets]).
 * Adds headers useful for HTTPS / Web Bluetooth test pages.
 */
export default {
  async fetch(
    request: Request,
    env: { ASSETS: { fetch: (req: Request) => Promise<Response> } },
  ): Promise<Response> {
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return new Response(res.body, { status: res.status, headers });
  },
};
