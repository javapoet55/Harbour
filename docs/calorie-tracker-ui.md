# Calorie Tracker

The center tab-bar clock opens a two-card chooser: Calorie Tracker and Pomodoro
Focus. Pomodoro still opens its existing module, including its notification route.

The Calorie Tracker is connected to the nutrition API (docs/nutrition-calls.md):
setup saves the call time, time zone, repeat, voice, no-answer choice and goals
(`PUT /api/nutrition/settings`); the confirm step verifies the phone number with a
voice-call code (`POST /api/nutrition/phone`) before "Turn On Daily Calls"; the
dashboard, Week/Month charts, insights and food log read the user's saved entries
(`/api/nutrition/log`, `/api/nutrition/summary`); food can be added, edited,
confirmed ("Looks right" on estimated items) and removed. Calories, protein, carbs
and fats are tracked; fiber, calcium, iron, vitamin D and omega-3 show goals only
("not tracked yet"). Users who already turned calls on open straight to the
dashboard, with "Call me now to try it" after setup and "Pause daily calls".

The `-calorie-design-preview` launch argument keeps the original design preview on
sample data (no network), which the UI test below uses.

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
