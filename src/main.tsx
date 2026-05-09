/**
 * Loads heavy app code only after required env is present.
 * Without VITE_SUPABASE_* at build time (e.g. missing Vercel env vars), importing the Supabase client throws and yields a blank screen.
 */
const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element");
}

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !key) {
  rootEl.innerHTML = `
    <div style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1.5rem;line-height:1.5;color:#111;">
      <h1 style="font-size:1.25rem;margin-bottom:0.75rem;">Configuration needed</h1>
      <p style="margin:0 0 1rem;">This deployment is missing Supabase environment variables, so the app cannot start.</p>
      <p style="margin:0 0 1rem;">In <strong>Vercel → Project → Settings → Environment Variables</strong>, add for Preview and/or Production:</p>
      <ul style="margin:0 0 1rem;padding-left:1.25rem;">
        <li><code>VITE_SUPABASE_URL</code></li>
        <li><code>VITE_SUPABASE_PUBLISHABLE_KEY</code></li>
      </ul>
      <p style="margin:0 0 1rem;">Also set other <code>VITE_*</code> keys your app expects (e.g. <code>VITE_OAUTH_REDIRECT_ORIGIN</code>, Meta/TikTok IDs). Redeploy after saving.</p>
      <p style="margin:0;font-size:0.875rem;color:#555;">Local dev: copy <code>.env.example</code> to <code>.env</code> and fill in values.</p>
    </div>
  `;
} else {
  void import("./boot.tsx");
}
