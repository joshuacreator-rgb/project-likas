# Role-Aware Login and Registration Verification

## Desktop

`/login?role=admin` opens with Administrator selected, updates the primary action to “Sign in as Administrator,” and exposes an explicit “Register as Administrator” entry point. `register?role=admin` preserves the selected role, presents an explicit Log in button, and explains that Administrator access is protected and must be provisioned by an Administrator.

## Mobile

At 390×844, both flows stack the four branded role cards into readable tap targets. `/login?role=responder` selects Responder / Disaster Team and updates its login/register actions. `/register?role=responder` preserves that selection, keeps the Log in button full-width, and clearly states that operational access is assigned through invitation or temporary demo provisioning.

## Security behavior

The registration UI exposes the four-role choice for recognition and training navigation, but only Citizen self-registration calls the registration mutation. The router also validates the supplied role and rejects privileged self-registration server-side. Administrator demo provisioning remains protected by the existing admin-only procedure; no unrestricted bypass was added.
