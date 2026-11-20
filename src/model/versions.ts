import { APP_VERSION } from '@/version';

/**
 * The version of what is stored: the app's own, to its second number ("0.1" for 0.1.4). There are no upgrade
 * steps before 1.0: a saved project or shop profile of another version is refused with a plain message, never
 * read. So the app's second number goes up whenever a change to a stored structure (or to a starter value a
 * saved copy should not keep) would make an older save wrong, and only then: its third number is for
 * everything else. One number for both projects and the shop profile.
 */
export const SAVE_VERSION: string = APP_VERSION.split('.').slice(0, 2).join('.');
export const PROJECT_VERSION = SAVE_VERSION;
export const SHOP_PROFILE_VERSION = SAVE_VERSION;
