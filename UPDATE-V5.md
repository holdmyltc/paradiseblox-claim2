# Update the deployed GitHub project to v5

Upload these changed files to the same paths in your `paradiseblox-claim2` repository:

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/verify-form.tsx`
- `src/components/header.tsx`
- `src/components/theme-toggle.tsx`
- `src/components/claim-atmosphere.tsx`
- `public/manifest.webmanifest`
- `CHANGELOG.md`

Commit message:

```text
Rebuild Claim 2 premium responsive design
```

Vercel will automatically redeploy after the commit. Keep `NEXT_PUBLIC_DEMO_MODE=true` while reviewing the design.
