# Project Likas deployment checklist

## Required configuration

- Set `DATABASE_URL` to a reachable MySQL database.
- Set `JWT_SECRET` to a long random value that is not committed to source control.
- Run `pnpm db:push` against the intended database before the first production start.
- Serve the app over HTTPS so secure session cookies and map/location features work correctly.

## Local sign-in

Local email/password registration and sign-in use the database and require `DATABASE_URL` and `JWT_SECRET`.

## Emails (invitations & password recovery)

- Set `RESEND_API_KEY` and `EMAIL_FROM`, otherwise invitation and password-recovery emails are skipped.
- `EMAIL_FROM` must use a domain verified in Resend (add the domain, paste the SPF/DKIM DNS records, verify). The sandbox sender `onboarding@resend.dev` only delivers to your own Resend account email.
- Set `PUBLIC_URL` with the `https://` scheme so emailed links reach the deployed app.
- If an invitation email fails, the admin UI shows the reason plus a copy-link fallback, and the invitation stays active. Check the server log for `[Invite]` / `[Email]` entries.

## Platform sign-in

Platform OAuth is optional. Set `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`, and `OAUTH_SERVER_URL` only when an OAuth application has been provisioned. Register this callback with the provider:

`https://your-domain.example/api/oauth/callback`

The local sign-in option remains available when OAuth is not configured.

## Notifications

In-app citizen emergency notifications work without external providers. Configure `EMAIL_PROVIDER_KEY` or `SMS_PROVIDER_KEY` only after selecting and provisioning a provider. Do not put provider secrets in client-side `VITE_` variables.

## Maps & directions (citizen)

The citizen "Map and directions" section and the report location picker use Leaflet with OpenStreetMap tiles — no API key or third-party proxy required, and they work from any host (local dev, Railway, a custom domain). "Get directions" opens a walking route in Google Maps in a new tab (`getDirectionsUrl`). The center data comes from `operations.centers`; until centers exist in the database the citizen page falls back to a small hardcoded demo list, so add real evacuation centers through the admin panel and the map/finder will show the real ones.

## Operational checks

- Verify an admin can view centers, users, and the Incident map.
- Verify an admin can assign an incident to a responder.
- Verify a responder sees assigned incidents and can mark them resolved.
- Verify a citizen can submit a report with a map pin.
- Test offline report queueing and reconnection before relying on it operationally.
- Keep database backups and review activity logs regularly.
