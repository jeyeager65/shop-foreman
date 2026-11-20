/** The app's version: the package's, with the commit a hosted build was made from. Shown at the foot of every page. */
export const APP_VERSION: string = __APP_VERSION__;
export const APP_COMMIT: string = __APP_COMMIT__;
/** In words: "0.1.0", or "0.1.0 (1a2b3c4)" for a hosted build. */
// The commit as semver build metadata, `0.1.0+144c9c1`: no parentheses, since G-code carries it inside a comment.
export const versionWords = (): string => (APP_COMMIT ? `${APP_VERSION}+${APP_COMMIT}` : APP_VERSION);
