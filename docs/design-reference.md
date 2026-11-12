# Saathi design reference

Source: [Figma design](https://www.figma.com/design/vqSt5CvCG0J5YLJykoeAoe/Untitled?node-id=0-1). The file contains one page (`Page 1`), 56 mobile frames, and a dedicated `Saathi / Design system & flow guide` frame. The design is a light-theme, Android-first experience for older adults and family caregivers.

## Foundations

| Token | Value | Use |
|---|---|---|
| `blue` | `#2457C5` | Primary actions and selected states |
| `green` | `#48A878` | Positive state |
| `bg` | `#F8F9FC` | Application background |
| `red` | `#DC3545` | Danger and SOS actions |
| `ink` | `#172B4D` | Main text |
| `muted` | `#53627A` | Secondary text |
| `pale` | `#EAF0FF` | Soft blue surface and secondary actions |
| `line` | `#DFE5EF` | Borders and disabled surfaces |
| `white` | `#FFFFFF` | Cards and controls |
| `mint` | `#E9F5EE` | Positive status surface |
| `rose` | `#FDECEF` | Skipped/danger status surface |

Typography uses Inter with weights Regular, Medium, Semi Bold, and Bold. The design guide lists sizes `36 / 28 / 24 / 20 / 18 / 16 / 14 px`. Senior body copy is 20 px. The spacing grid is 8 px; cards use 16–24 px corner radii; primary touch targets are 64 px tall. Layouts expand vertically for larger text. Labels do not rely on color alone.

## Components and visual language

- `Saathi button`: Primary, Secondary, Danger, Quiet, Pressed, and Disabled variants; 64 px height, 16 px radius, 20 px semibold label.
- `Saathi field`: 392 × 100 px reference component with 16 px padding and 16 px radius.
- `Medicine status`: Taken, Skipped, and Not confirmed badges; each has text and a distinct surface treatment.
- Recognisable 24 px line icons cover home, tasks, medicine, family, profile, microphone, phone, music, help, alert, back, check, play, pause, shield, share, clock, plus, bell, heart, video, volume, and eye.
- Cards use white surfaces and generous spacing against the pale background.

## Screen inventory

The Figma page contains 56 frames. In page order:

1. Welcome
2. Choose your role
3. Elderly home
4–6. Voice · Listening / Thinking / Speaking
7–8. Daily tasks / Tasks · Completed
9–12. Medicines / Medicine · Confirm taken / Taken / Later
13–15. Bhajan library / Playing / Paused
16–19. Smartphone help / Sharing · Consent / Active / Stopped
20–23. Emergency SOS / SOS · Confirm / Alert sent / Acknowledged
24–25. Elderly family / Elderly profile
26–27. Family dashboard / Family member profile
28–30. Add a task / Assign task / Task · Saved
31. Shared activity
32–33. Add medicine / Medicine · Saved
34–36. Remote guidance / Guidance · Waiting / Active
37–42. Emergency notification / Alert · Acknowledged / Emergency · Resolved / Alerts · Empty / Dashboard · Loading / Connection · Error
43–50. Home · Medicine confirmed / Medicine schedule · Confirmed / Dashboard · Task added / Shared activity · Before task / Caregiver profile / Guidance · Session ended / Video call · Connecting / Emergency · Safety confirmation
51–56. Voice language / Home · Walk completed / Language · Hindi / Language · Tamil / Voice · Hindi / Voice · Tamil

The extra frame is `Saathi / Design system & flow guide`.

## Navigation and journeys

The design guide documents these journeys:

1. Welcome → Elderly role → Home → Talk to Saathi → Morning Bhajan.
2. Home → Medicines → Confirm taken → Recorded confirmation.
3. Home → SOS → Confirm → Alert sent → Family acknowledgement.
4. Home → Smartphone help → Consent → Sharing active → Guidance → Stop.
5. Welcome → Family role → Dashboard → Add task → Assign → Activity.

Sharing is view-only and consent-based; the older adult performs every tap. Medicine is recorded only after explicit confirmation. SOS acknowledgement and resolution are separate actions. The Figma concept itself does not initiate calls, send alerts, or stream a screen.

## Implementation coverage (Phases 2–7)

The current app implements welcome/authentication and family joining; elderly and caregiver navigation; dashboards; task lists and creation; medicine schedules, local reminders, and explicit responses; a shared task/medicine activity timeline; family contacts; profile and language settings; consent-based phone guidance and Android screen relay; one-frame Gemini screen guidance after caregiver confirmation; Gemini Live voice UI and confirmed tool actions; a configurable licensed devotional player; and the SOS/acknowledgement lifecycle. Screens share the Figma palette, Inter, large readable text, spacious cards, and large touch targets.

Not all 56 design frames have a dedicated screen yet. Bhajan playback needs a licensed HTTPS source. Video calling needs a separate calling provider and signaling service; screen sharing does not provide calls. Several polished confirmation/success variants and a dedicated member detail view remain. The supplied Figma MCP plan reached its call limit during this continuation, so this pass used the extracted design reference and available frame metadata rather than a fresh render of every screen. Figma exports are not runtime assets; the UI uses local native components and text controls.

## Extraction note

Tokens and component measurements above were read from the Figma `Design system & flow guide` and generated design context. No temporary Figma asset URLs are used by the app.

