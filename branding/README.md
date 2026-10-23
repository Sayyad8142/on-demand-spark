# App icon — single source of truth

Replace **`branding/app-icon-master.png`** (square PNG, 1024px or larger), then run:

    bun run icons:generate

This regenerates Android launcher/adaptive/round icons (all densities), the web favicon,
Apple touch icon, PWA icons (192/512), the in-app logo, and the Google Play listing icon
`branding/store/play-store-icon-512.png`. `bun run android:sync` / `android:build` run it
automatically. Generated files are committed, so builds without ImageMagick still use them.
The Play Console listing icon must be uploaded by hand (Store presence → Main store listing → App icon).
