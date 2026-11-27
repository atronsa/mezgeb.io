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

The Cloudflare Worker `mezgeb-io` (Workers Builds) is connected to this
repo. It builds and deploys `main` to mezgeb.io, and gives every pull
request a preview URL. It serves `apps/site/dist` as static files, as set
in [`wrangler.jsonc`](wrangler.jsonc). Its build settings:

| Setting | Value |
|---|---|
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler@4.161.0 deploy` |
| Preview command | `npx wrangler@4.161.0 versions upload` |
| Root directory | *(empty: repo root)* |
| Build variables | `NODE_VERSION=24`, `PNPM_VERSION=11.28.11`, `CI=true` |

Keep `NODE_VERSION` and `PNPM_VERSION` in step with `.nvmrc` and
`packageManager` in `package.json`. Wrangler is pinned in the commands
because it is not a dependency of this repo.

`.github/workflows/site.yml` runs the same sync, type check and link check
on every pull request, as a required check.

## License

Apache-2.0, like Mezgeb.
