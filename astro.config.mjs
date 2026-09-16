// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Canonical site URL — used by Astro.site for canonical link tags,
  // sitemap URLs, and absolute Open Graph image URLs.
  site: 'https://simonluerwer.com',
  // Hide the floating dev toolbar pill in `astro dev` — gets in the way
  // when testing the lightbox / mobile gestures on a phone over LAN.
  devToolbar: { enabled: false },
  integrations: [sitemap()],
  adapter: vercel({
    webAnalytics: { enabled: true }
  }),
});
