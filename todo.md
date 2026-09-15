# Project TODO

- [x] Establish Project Likas visual system: elegant civic emergency-operations palette, typography, responsive shell, navigation, and accessibility states
- [x] Extend the user model and role model for admin, center staff, responder, and citizen permissions
- [x] Add normalized database schema for evacuation centers, staff assignments, evacuees, resources, resource transactions, risk reports, evidence metadata, alerts, responder actions, weather snapshots, settings, logs, and report exports
- [x] Apply the generated database migration and verify the schema
- [x] Implement protected role-aware backend procedures with secure validation and audit logging
- [x] Implement role-specific dashboards with operational statistics, occupancy/resource charts, recent activity, active alerts, and pending incidents
- [x] Implement evacuation center CRUD, assignment, status, capacity safeguards, available slots, and occupancy rate calculations
- [x] Implement evacuee registry search/filter, placement, transfers, releases, and transactional occupancy safeguards
- [x] Implement resource inventory, stock-in/out, transfers, borrow/return workflows, expiry and low-stock states, history, and shortage alerts
- [x] Implement the interactive Leaflet/OpenStreetMap operational map with center, incident, report, and resource layers plus filters and popups
- [x] Implement citizen risk/emergency reports with priority/status workflow, coordinates, responder assignment, and report tracking
- [x] Implement secure evidence upload references using external object storage and database metadata only
- [x] Implement targeted in-app alerts, fallback notification behavior, and responder assignment/response/resolution workflows
- [x] Implement configurable weather provider behavior and current local conditions/warnings display
- [x] Implement administrative reporting, activity/system logs, configurable settings, and safe backup/restore workflow surfaces
- [x] Add unit tests for occupancy safeguards, role authorization, resource status logic, alert fallback, and report transitions
- [x] Run type checks, tests, and responsive visual verification; fix any issues found
- [x] Save the final completed checkpoint for delivery
- [x] Add explicit focus-visible and keyboard accessibility states across custom navigation, modal, and action controls
- [x] Add report exports and proper foreign keys/relations for interconnected operational tables
- [x] Implement audit logging and complete role-based authorization across operational procedures
- [x] Replace static dashboard, map, and alerts with data-driven role-specific tRPC-backed modules, including map popups, search, and layer/filter controls
- [x] Add tests for role authorization, alert fallback behavior, and risk report state transitions
- [x] Address unresolved visual-review issues in the command-center hierarchy and brand identity

- [x] Add admin-only User & Role Management navigation and workspace
- [x] Add user listing, role assignment, center-staff assignment, and role audit-history procedures
- [x] Display exact role names for admin, center staff, responder, citizen, and legacy user identities
- [x] Improve citizen and elder usability with larger default text, high contrast, larger targets, plain-language labels, and reduced cognitive load
- [x] Add tests for user role assignment authorization and role label formatting
- [x] Re-run type checks, tests, and responsive visual verification; save an updated checkpoint

- [x] Create a dedicated citizen home view focused on nearby centers, urgent alerts, and emergency reporting
- [x] Add citizen-oriented nearby-center availability and alert presentation with clear plain-language actions
- [x] Add browser voice input assistance for emergency descriptions with permission and unsupported-browser fallbacks
- [x] Add text-to-speech controls for citizen instructions, alerts, and report confirmation
- [x] Add tests for citizen view role routing and voice-assistance fallback behavior
- [x] Re-run type checks, tests, responsive visual verification, and save an updated checkpoint

- [x] Add browser GPS permission flow and distance-based sorting for nearby evacuation centers
- [x] Add directions actions using the approved map integration and safe map fallbacks
- [x] Add English/Filipino language toggle with translated citizen labels, alerts, and reporting copy
- [x] Add localized Filipino and English text-to-speech prompts
- [x] Add offline emergency-report queue with reconnect retry and native SMS fallback
- [x] Add tests for distance sorting, localization, offline queue serialization, and SMS fallback payloads
- [x] Re-run checks, responsive visual verification, and save an updated checkpoint

- [x] Cache the center list locally for offline citizen browsing and directions fallback
- [x] Add a lightweight offline map presentation using cached center coordinates and clear unavailable-map messaging
- [x] Add Filipino translations for live database-created center names and alert content with safe English fallback
- [x] Add admin SMS provider/official emergency number settings and connect them to citizen SMS fallback links
- [x] Create and validate a reusable emergency-management workflow skill with bundled references
- [x] Add tests for cached centers, live translation fallback, SMS configuration, and skill validation
- [x] Re-run checks, responsive visual verification, save an application checkpoint, and deliver the reusable skill

- [x] Add a role-choice login presentation for admin, center staff, responder, and citizen users
- [x] Preserve server-authoritative account roles and reject role mismatch attempts
- [x] Route each authenticated role to its appropriate workspace after login
- [x] Add tests for role-choice validation and stored-role authorization
- [x] Run checks, verify responsive login states, and save an updated checkpoint

- [x] Clarify that platform OAuth uses the server-stored role and remove misleading intended-role persistence
- [x] Add focused local-auth role-choice authorization contract coverage
- [x] Capture mobile login verification and save a fresh checkpoint

- [x] Add registration and password-recovery links to the role-choice login screen
- [x] Add admin-only staff/responder invitation storage, acceptance, expiry, and audit procedures
- [x] Add invitation management controls to the User & Role Management workspace
- [x] Add role-specific first-login onboarding guidance with dismiss and persisted completion state
- [x] Add tests for invitation authorization, expiry, and onboarding content selection
- [x] Run checks, responsive visual verification, and save an updated checkpoint

- [x] Log invitation acceptance and invitation state changes in the activity log
- [x] Add procedure-level tests for admin-only invitation access and expired/reused token rejection
- [x] Save a fresh Project Likas checkpoint after the account-flow changes

- [x] Update login chooser labels to Administrator, Evacuation Center Staff, Responder / Disaster Team, and Citizen
- [x] Preserve server-authoritative role validation and route each role to the correct workspace
- [x] Add or update role-login tests and responsive verification for the revised labels
- [x] Save a checkpoint for the revised login-role flow

- [x] Save a fresh Project Likas checkpoint after the revised login-role changes, tests, and responsive verification

- [x] Add organization-specific marks and department names to each login role card
- [x] Add admin-controlled role-based demo account provisioning for training and testing
- [x] Add TOTP two-factor authentication enrollment and challenge for Administrator and Responder / Disaster Team accounts
- [x] Add automated security, provisioning, and role-card tests plus responsive login verification; authenticated workspace verification deferred by user
- [x] Save a verified checkpoint for organization branding, demo provisioning, and targeted 2FA

- [x] Deferred by user: add focused tests for successful admin demo-account provisioning and for login requiring and completing 2FA for eligible roles
- [x] Deferred by user: perform authenticated desktop and mobile visual verification of the User & Role demo panel and Settings 2FA flows, then record findings

- [x] Deferred by user: perform authenticated browser verification of demo-account and 2FA workspace buttons when a working Administrator session is available

- [x] Add accessible loading animations and clear actionable errors to login and 2FA verification forms
- [x] Add an Administrator demo-account dashboard with monitoring, expiry status, and revocation
- [x] Add tests for login/2FA feedback and admin-only demo-account revocation
- [x] Verify the updated login responsively and review the Administrator demo-account dashboard responsive layout; authenticated populated-dashboard verification remains dependent on an Administrator session
- [x] Save a checkpoint for the login feedback and demo-account dashboard update

- [x] User-approved deferral: populated Demo accounts dashboard desktop/mobile, status-filter, and revoke-confirmation verification remains blocked pending a working Administrator session

- [x] User-approved deferral: authenticated populated Demo accounts dashboard verification remains blocked until a working Administrator session is available

- [x] Add explicit Log in and Register buttons to the demo/testing experience
- [x] Preserve four-role selection across demo login and registration flows
- [x] Keep demo provisioning and administrative authorization server-enforced; do not expose unrestricted bypass access
- [x] Add tests and responsive verification for the new demo entry points
- [x] Save a checkpoint for the role-aware demo login and registration update

- [x] Add focused tests for role-preserving login/register query behavior and demo entry-point wiring
- [x] User-approved deferral: verify Demo accounts dashboard Log in/Register shortcuts in an authenticated Administrator session when available
