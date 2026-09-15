# Citizen and Admin Verification

Desktop verification confirms the operations dashboard remains visually stable and the citizen route maintains the clear emergency-reporting hierarchy, nearby-center cards, bilingual controls, and connectivity messaging. Mobile verification confirms the header controls wrap cleanly, emergency reporting and 911 remain prominent, center cards remain readable, and the offline map section has a compact fallback surface for cached coordinates and center markers when connectivity is unavailable.

The offline map is intentionally lightweight: cached coordinates are projected into a bounded local plot with labeled markers, while online map tiles and in-app directions remain progressive enhancements. Live center and alert translation fields use Filipino values when present and fall back to English when missing. The admin Settings workspace stores the official SMS number and provider identifier without exposing provider secrets to the client.
