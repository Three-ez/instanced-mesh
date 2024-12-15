// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import AutoImport from 'astro-auto-import';
import { resolve } from 'path';
import mdx from '@astrojs/mdx';
// https://astro.build/config
export default defineConfig({
  site: 'https://agargaro.github.io/instanced-mesh',
  output: 'static',
  vite: {
    resolve: {
      alias: { $components: resolve('./src/components') },
    },
    build: {
      rollupOptions: {
        external: [/@three.ez/],
      },
    },
  },
  integrations: [
    AutoImport({
      imports: ['./src/components/Example/Example.astro'],
    }),
    starlight({
      plugins: [
        // Generate the documentation.
        starlightTypeDoc({
          entryPoints: ['../src/index.ts'],
          typeDoc: {
            exclude: ['./examples/**/*'],
            skipErrorChecking: true,
            excludeExternals: true,
          },
          tsconfig: '../tsconfig.json',
        }),
      ],
      title: 'three.ez/instanced-mesh',
      logo: {
        src: './src/assets/samoyed-mascot.png',
        alt: 'logo-samoyed-mascot',
      },
      favicon: './favicon.ico',
      social: {
        github: 'https://github.com/agargaro/instanced-mesh',
        discord: 'https://discord.gg/MVTwrdX3JM',
      },
      sidebar: [
        {
          label: 'Guides',
          items: [
            // Each item here is one entry in the navigation menu.
            { label: 'Example Guide', slug: 'guides/example' },
          ],
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
        // Add the generated sidebar group to the sidebar.
        typeDocSidebarGroup,
      ],
    }),
    // Make sure the MDX integration is included AFTER astro-auto-import
    mdx(),
  ],
});
