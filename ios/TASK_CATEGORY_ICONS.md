# Dynamic task category icons

The Tasks screen derives its badge on-device from the current task title. It uses word-based matching for common English task descriptions and falls back to an existing category name, then a neutral Tasks badge. These are presentation hints, not persisted category assignments. Editing a title automatically refreshes its artwork.

Examples: fitness/gym/workout → multicolor weightlifter; dentist/dental → tooth; homework/study → graduation cap; call/meeting → briefcase; groceries → basket. Additional mappings cover health, finance, food, travel, home and social tasks. More specific matches win over general ones, and whole-word matching avoids interpreting “calligraphy” as a phone call.

Existing category names remain the displayed labels. Existing project names remain beneath the task time. At accessibility text sizes the category badge moves below the title/time instead of crowding the row.

`TaskCategoryAppearance` holds the matching rules. `TaskCategoryBadge` renders native vector artwork using SwiftUI Paths/Canvas and gradient SF Symbols. Icons scale with text, have a text category label for VoiceOver, and use primary label text for increased contrast. No image download, API request or new permission is needed.

Validation: four category resolver/decoding tests cover the requested examples, ambiguous words, explicit labels, and compatibility with existing task and voice responses. A native SwiftUI image render was visually inspected in light mode. The full iOS simulator build passed for arm64 and x86_64. The first full build also exposed two previously unverified WebRTC audio-session type mismatches; those were corrected, and the resolved package lockfile is committed. Physical-device visual checks remain useful for font sizes and theme preferences.
