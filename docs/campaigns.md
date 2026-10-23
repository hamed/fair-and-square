# Private campaign links

Each public destination contains one opaque eight-character placement ID in `utm_content`. Source, platform, location, campaign and collaborator details belong in your private database, keyed by that ID. The public app records `campaign_id`; it does not download or contain the database.

Public links use your own website directly: `https://hamed.github.io/fair-and-square/?utm_content=ID`. Umami measures the traffic; it is not a redirect service in this workflow. GitHub Pages serves the same site for every ID, and no public lookup file or redirect table is needed.

## Create a placement

```sh
npm run campaign -- add
```

No placement details are required. The default destination is the live Fair and Square home page with only `?utm_content=ID` appended. Source/medium/campaign/term tags are removed from custom destinations so generated links remain ID-only. Other query parameters and simulation fragments are preserved. Use `--url` for a different destination.

Record the meaning of each ID in your own private database. An optional `--label` is stored only in the local private registry and never put into a URL or the website build. You can omit labels entirely.

The command generates a secure random ID, checks it against existing IDs, saves the placement, and displays the URL. Use that URL directly in a post or QR code. There is no separate link-creation or attachment step, and the command makes no requests to Umami.

One ID per location/design is normally sufficient for flyers. For separately tracked physical copies:

```sh
npm run campaign -- add --count 20
```

This creates twenty independent IDs with private copy numbers and directly usable URLs. Each can have its own QR code. Do not reuse or reassign an ID to a different placement.

## Look up and export

```sh
npm run campaign -- list
npm run campaign -- show ID
npm run campaign -- export
```

The CSV includes the ID, optional private label, URL on your own website, and creation time. Import the IDs into your own private database/spreadsheet and add whatever descriptions you need. An existing CSV is never overwritten silently; use `--out` with a new private filename for another export. Legacy third-party short-link fields, if present in an existing private registry, are preserved there but omitted from all output and exports.

The default files are:

```text
~/.local/share/fair-and-square/campaigns.private.json
~/.local/share/fair-and-square/campaigns.private.csv
```

The JSON is the authoritative registry: back it up privately. It is written atomically, with owner-only file permissions and a lock against concurrent changes. `init` creates an empty registry without removing existing entries:

```sh
npm run campaign -- init
```

Every command accepts `--registry` for an alternative file outside the repository. Export also accepts `--out`. Paths inside this checkout, including symlinks into it, are rejected. Private filenames are also ignored by Git as a fallback. Neither the registry nor exported CSV is an input to the website build. Keep campaign metadata and backups out of public repositories, build assets, issues and PR descriptions.

## Attribution in the app

- Filter Umami's native reports by **UTM Content** to compare IDs. Source/medium/campaign are deliberately unset on generated links; look those details up in your private database.
- All custom events on a tagged page also include `campaign_id` when `utm_content` is exactly eight lowercase letters/digits.
- The ID follows internal links between the main page, About, and Making Of, including new-tab About/Follow links and clicks before page modules load. Anchors and existing parameters are preserved. Attribution requires no browser storage or cookie. Legacy links containing other standard UTM tags remain supported, but the ID generator adds none of them.
- Social, book and payment URLs are not modified. Their click events retain the ID from the page that contains them.
- Newly generated simulation shares retain only their existing `fs_share` attribution and simulation fragment. They do not inherit the original promotional campaign, so readers sharing a simulation do not silently credit its later recipients to a flyer or post.
- A manually forwarded promotional link retains its original tags; the ID identifies the distributed link, not proof of the last person or platform that forwarded it.

The app's event names and counting rules are in [analytics.md](analytics.md). Umami's [UTM documentation](https://docs.umami.is/docs/utm) explains the native reports.
