# jonathanellis.dev

Personal site for Jonathan Ellis. Static HTML + Three.js + GSAP. Deploys on Coolify.

## Structure

```
main-site/
├── index.html          ← landing page with metallic J logo
├── public/
│   ├── logo.svg        ← green J logo
│   └── favicon.svg     ← favicon (dark bg + green J)
└── README.md
```

## Local dev

Any static server works. Quickest:

```bash
cd main-site
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

Coolify watches the `main` branch of the GitHub repo. Push to deploy.

## Colors

- Green: `#00ff40`
- Charcoal: `#25272b` / `#343536`
- Ink (background): `#0c0d0f`
- Bone (text): `#efefef`

## Fonts

- Headings: Cormorant (Google Fonts)
- Body: Inter (Google Fonts)

## Known next steps (hand off to Claude Code)

- [ ] Replace placeholder Three.js geometry with true SVG-path-extruded J from `public/logo.svg` using `THREE.SVGLoader` + `ExtrudeGeometry`
- [ ] Swap procedural env cubemap for a proper HDRI (PMREM) for realistic metallic reflections
- [ ] Add UnrealBloomPass post-processing for neon glow on the metallic edges
- [ ] Accessibility: reduce motion for `prefers-reduced-motion: reduce`
- [ ] Meta/OG tags for link previews
