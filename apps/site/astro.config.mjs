// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';

/** A sidebar group listing every page of one docs/ folder, in file-name order. */
const docs = (/** @type {string} */ directory, /** @type {string} */ label, collapsed = false) => ({
  label,
  collapsed,
  items: [{ autogenerate: { directory: `docs/${directory}` } }],
});

export default defineConfig({
  site: 'https://mezgeb.io',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Mezgeb',
      description: 'An open-source double-entry ledger with offline sync and signed transactions.',
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/atronsa/mezgeb' }],
      plugins: [
        starlightLinksValidator(),
        starlightOpenAPI([
          {
            base: 'api',
            schema: './generated/openapi/mezgeb.v1.yaml',
            sidebar: { label: 'API reference', collapsed: true },
          },
        ]),
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'docs' },
            { label: 'Specification', slug: 'docs/spec' },
            { label: 'Invariants', slug: 'docs/invariants' },
            { label: 'Architecture', slug: 'docs/architecture' },
            { label: 'Threat model', slug: 'docs/threat-model' },
            { label: 'Database schema', slug: 'docs/db-schema' },
            { label: 'Regulation', slug: 'docs/regulatory' },
          ],
        },
        docs('api', 'API guide'),
        ...openAPISidebarGroups,
        docs('offline', 'Offline payments'),
        docs('accounting', 'Accounting'),
        docs('reconciliation', 'Reconciliation'),
        docs('runbooks', 'Runbooks'),
        {
          label: 'Security',
          items: [{ label: 'Reporting a vulnerability', slug: 'security' }, docs('security', 'Assessment')],
        },
        docs('adr', 'Decisions (ADRs)', true),
        docs('roadmap', 'Roadmap', true),
        docs('evidence', 'Evidence', true),
      ],
    }),
  ],
});
