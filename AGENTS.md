# AulaVirtualJv

## Design work

- Load `.agents/skills/design-taste-frontend/SKILL.md` and `.agents/skills/web-design-guidelines/SKILL.md` for interface work. Use Taste's `references/app-screens.md` for teacher administration; apply its page guidance to the public entrance.
- Preserve the existing HTML, CSS and JavaScript stack, local Nunito font, classroom map, avatars, animals, tutorial sequence and student/team identity flows. All four entry points, including student registration, recovery, the live classroom, team roster, chat and teacher simulator, share `assets/palette.css` and the user's two palettes: `#031926 #468189 #77ACA2 #9DBEBB #F4E9CD` and `#99B898 #FECEA8 #FF847C #E84A5F #2A363B`. Use petrol/charcoal, teal and champagne as the base, with coral, peach and sage accents. Classroom illustrations retain distinct team furnishings, skin tones, avatars and animals; shared walls and entrance surfaces follow the supplied palettes. Define shared color roles once in `palette.css`; do not reintroduce page-scoped copies of the old green palette.
- Preserve the user's italic words and colored underlines on the entrance, now in coral/salmon to match the supplied palettes. These explicit choices override Taste's general bans on styled accent words and preset palette restrictions. Keep body copy upright; use darker derived shades where small text needs more contrast. Do not restore the previous electric blue/plum palette automatically.
- Keep the main task prominent. Place occasional configuration in a compact native disclosure; give icon buttons accessible names, focus states and 44 px touch targets.
- Use the supported Browser or CUA surface for visual checks. Do not run the bundled direct browser inspector when it conflicts with the active browser policy; perform and report equivalent checks through the supported surface.
- Check desktop, tablet and phone layouts with long names, empty data, realistic team counts, closed disclosures and opened dialogs. Preserve real zero counts and distinguish unavailable data.
- Keep preview fixtures offline and explicitly fictional. Do not publish them or change real course/student records for visual verification.

## Validation and publication

- Run the checks appropriate to the change. The current commands are `npm test` and `npm run check`.
- Keep all shared HTML/CSS/JavaScript release query parameters equal to `package.json`'s version.
- Preserve GitHub Pages hosting. Use the actual remote main commit as the publication base; local materialized history may differ.
- Do not publish credentials or private keys. Keep course ownership and access-code behavior intact.
