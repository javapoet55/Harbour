# Calorie Tracker UI preview

The center tab-bar clock opens a two-card chooser: Calorie Tracker and Pomodoro
Focus. Pomodoro still opens its existing module, including its notification route.
The calorie module is an independent SwiftUI preview with no backend, migrations,
notifications, voice calls, permissions, analytics events or persistence.

Screens: introduction, check-in time/timezone/repeat/no-answer options, editable
nutrition goals, review, ready confirmation, Today/Week/Month nutrition dashboard,
insights/recommendations and food log. Local additions/removals update the displayed
calorie total. Macro and nutrient amounts and trends are illustrative fixtures.
Dates can be browsed but do not fetch history. Closing the preview resets its data.

The supplied calorie image pack is bundled locally; the illustration is displayed
from its artwork region. All labels, controls, cards, progress rings and charts are
native views. No supplied screen is used as an interactive screenshot.

Preview launch arguments:
- -calorie-design-preview
- -wellness-design-preview

Simulator UI coverage exercises setup through confirmation, dashboard period
switches, insights, food-log navigation and adding a local food entry. Build and
visual inspection use the 375-point-wide iPhone simulator.
