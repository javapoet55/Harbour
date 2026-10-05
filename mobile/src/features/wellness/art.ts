import type { ImageSourcePropType } from 'react-native';

/**
 * The regions Swift crops out of its two sprite sheets at draw time (`WellnessPackRegion`,
 * WellnessChooserView.swift:146-156; `ModuleGuideArtwork`, WellnessModuleGuide.swift:122-130), cut
 * ONCE with the same pixel rectangles into small files under assets/wellness/ — see §22 Run C for the
 * script. Each file is the exact region Swift shows, so it can be drawn whole.
 */

export type WellnessModule = 'calories' | 'pomodoro' | 'moments' | 'shopping';

/** The chooser: hero figure (35,18,315×384) and its accent (498,273,244×108). */
export const MENU_HERO: ImageSourcePropType = require('../../../assets/wellness/menu-hero.png');
export const MENU_HERO_ACCENT: ImageSourcePropType = require('../../../assets/wellness/menu-hero-accent.png');

/** Each module card's icon tile and its background art. */
export const MENU_ART: Record<WellnessModule, { icon: ImageSourcePropType; art: ImageSourcePropType }> = {
  shopping: { icon: require('../../../assets/wellness/menu-shopping-icon.png'), art: require('../../../assets/wellness/menu-shopping-art.png') },
  calories: { icon: require('../../../assets/wellness/menu-calories-icon.png'), art: require('../../../assets/wellness/menu-calories-art.png') },
  pomodoro: { icon: require('../../../assets/wellness/menu-pomodoro-icon.png'), art: require('../../../assets/wellness/menu-pomodoro-art.png') },
  moments: { icon: require('../../../assets/wellness/menu-moments-icon.png'), art: require('../../../assets/wellness/menu-moments-art.png') },
};

/** Each guide's header picture (column + 20, 72, 105×108) and three step pictures (116×153 at y 429). */
export const GUIDE_ART: Record<WellnessModule, { header: ImageSourcePropType; steps: [ImageSourcePropType, ImageSourcePropType, ImageSourcePropType] }> = {
  calories: {
    header: require('../../../assets/wellness/guide-calories-header.png'),
    steps: [
      require('../../../assets/wellness/guide-calories-step1.png'),
      require('../../../assets/wellness/guide-calories-step2.png'),
      require('../../../assets/wellness/guide-calories-step3.png'),
    ],
  },
  pomodoro: {
    header: require('../../../assets/wellness/guide-pomodoro-header.png'),
    steps: [
      require('../../../assets/wellness/guide-pomodoro-step1.png'),
      require('../../../assets/wellness/guide-pomodoro-step2.png'),
      require('../../../assets/wellness/guide-pomodoro-step3.png'),
    ],
  },
  moments: {
    header: require('../../../assets/wellness/guide-moments-header.png'),
    steps: [
      require('../../../assets/wellness/guide-moments-step1.png'),
      require('../../../assets/wellness/guide-moments-step2.png'),
      require('../../../assets/wellness/guide-moments-step3.png'),
    ],
  },
  shopping: {
    header: require('../../../assets/wellness/guide-shopping-header.png'),
    steps: [
      require('../../../assets/wellness/guide-shopping-step1.png'),
      require('../../../assets/wellness/guide-shopping-step2.png'),
      require('../../../assets/wellness/guide-shopping-step3.png'),
    ],
  },
};

/** `Image("wellness-navigation")`: the tab bar's centre button and the chooser's selected footer item. */
export const WELLNESS_NAVIGATION: ImageSourcePropType = require('../../../assets/wellness/wellness-navigation.png');

/** `Image("pomodoro-tomato")`: the focus timer's centre picture. */
export const POMODORO_TOMATO: ImageSourcePropType = require('../../../assets/wellness/pomodoro-tomato.png');

/**
 * `CaloriePackArt` (CalorieTrackerView.swift:918-930): the robot illustration, the 218×140 region at
 * (1305, 790) of `calorie-design-pack`, cut at its own size — the sheet has no more detail to give.
 */
export const CALORIE_AGENT: ImageSourcePropType = require('../../../assets/wellness/calorie-agent.png');
