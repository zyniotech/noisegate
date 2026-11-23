import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'NoiseGate',
    short_name: 'NoiseGate',
    description:
      'Label, dim, or hide YouTube channels using official synthetic disclosures, local rules, and open filter lists.',
    permissions: ['storage', 'alarms'],
    host_permissions: ['*://*.youtube.com/*', 'https://*/*'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'noisegate@noisegate.local',
              strict_min_version: '128.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
