# mezgeb.io

The website for [Mezgeb](https://github.com/atronsa/mezgeb), the open-source
double-entry ledger.

| Part | URL | Stack | Status |
|---|---|---|---|
| `apps/site` | [mezgeb.io](https://mezgeb.io) | Astro + Starlight | Landing, docs, API reference |
| `apps/app` | app.mezgeb.io | Next.js (BFF) | Not started: waits for the login and API-key ADR in the mezgeb repo |

## Where the content comes from

The mezgeb repo is the source of truth. This repo never edits docs by hand.
`scripts/sync-mezgeb.mjs` copies `docs/`, `SECURITY.md` and
`openapi/mezgeb.v1.yaml` from mezgeb at the ref in [`mezgeb.version`](mezgeb.version),
before every dev run and build. On the way, it turns relative Markdown links
into site routes, or into GitHub links for files that are not published
(crates, migrations). The synced files are git-ignored.

To publish a new release of the docs, change `mezgeb.version` to its tag in
a one-line PR.

## Develop

Requirements: Node 24, pnpm 11 (`corepack enable`).

```sh
pnpm install
pnpm dev                        # docs at the pinned ref
MEZGEB_DIR=../mezgeb pnpm dev   # docs from your local mezgeb checkout
pnpm build                      # static site in apps/site/dist, with link check
pnpm check                      # type check
```

Dependencies must be at least 14 days old (`minimumReleaseAge` in
`pnpm-workspace.yaml`), and are pinned to exact versions.

## Deploy

`.github/workflows/site.yml` builds every pull request. On `main`, it
deploys `apps/site/dist` to the Cloudflare Pages project `mezgeb-io`. It
needs the repository secrets `CLOUDFLARE_API_TOKEN` (scope: Cloudflare Pages,
Edit) and `CLOUDFLARE_ACCOUNT_ID`.

## License

Apache-2.0, like Mezgeb.
