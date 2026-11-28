# Third-party notices

Original Icarus application code is distributed under [MIT](LICENSE). Dependencies and vendored assets keep their own licenses.

## Included assets

- **Inter Variable** — SIL Open Font License 1.1. Font: `public/brand/InterVariable.woff2`; license: [Inter-OFL.txt](public/brand/Inter-OFL.txt).
- **Player.js 0.1.0** — BSD-3-Clause. Vendored file, provenance and original license: [public/vendor/playerjs](public/vendor/playerjs/README.md). Used for the configurable Bunny embed; this does not certify a provider configuration.
- **Material Symbols Outlined 2.985** — Copyright 2026 Google LLC. Apache-2.0. Google Fonts WOFF2 subsets for the lesson player and the mobile member frame. [Provenance and integrity](public/vendor/material-symbols/README.md) · [Original license](public/vendor/material-symbols/LICENSE-APACHE.txt).
- **Icarus visual assets** — supplied as the official visual system. The code license does not grant trademark rights.
- **Help Center screenshots** — `src/pages/help-images/` shows screens of the Asaas, Bunny Stream and Cloudflare dashboards, captured for instructional use, with keys, emails, domains, names, account numbers and metrics replaced by sample values. Product names, logos and interfaces belong to their respective owners. Their use does not imply affiliation, endorsement or a certified provider configuration, and the code license does not cover them.

## Direct runtime dependencies

Exact versions and transitive dependencies are recorded in `package-lock.json`.

| Package | License |
|---|---|
| React, React DOM, React Router | MIT |
| Supabase JS, TanStack React Query | MIT |
| Radix UI Dialog | MIT |
| TipTap React, Starter Kit, Link | MIT |
| DOMPurify | MPL-2.0 OR Apache-2.0 |
| Lucide React | ISC |
| [Boring Avatars 2.0.4](https://github.com/boringdesigners/boring-avatars) (default profile image) | MIT |
| [saxes](https://github.com/lddubeau/saxes/tree/v6.0.0) (upload Edge) | ISC |
| [qpdf-wasm 0.3.1](https://github.com/neslinesli93/qpdf-wasm) (wrapper, ISC), unmodified npm package, loaded only when a PDF is uploaded. Its `qpdf.wasm` bundles [qpdf](https://github.com/qpdf/qpdf) (Copyright (c) 2005-2025 Jay Berkenbilt and Manfred Holger, Apache-2.0), [libjpeg-turbo 2.1.1](https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/LICENSE.md) (IJG License, BSD-3-Clause and zlib; this software is based in part on the work of the Independent JPEG Group) and [zlib](https://zlib.net/zlib_license.html) (zlib License) | ISC, Apache-2.0, IJG, BSD-3-Clause and zlib |
| [cf-wasm/resvg](https://github.com/fineshopdesign/cf-wasm/tree/main/packages/resvg) and [resvg-wasm](https://github.com/thx/resvg-js/tree/v2.6.2), unmodified npm packages (upload Edge) | MPL-2.0 |

Installed packages include upstream license files. Development tooling and the independently installed Supabase/Docker runtime have their respective upstream licenses. No Frappe source or dependency is included in this release tree.
