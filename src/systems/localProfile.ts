/**
 * The signed-in player's own display name, shared with the Phaser scenes.
 *
 * Remote players arrive with a name on their presence row, but the local player's
 * name lives in Convex and only the React shell sees it — so it publishes it here
 * for the nametag that floats over your own penguin.
 */

const GUEST_LABEL = 'You';

let displayName = '';

export function setLocalDisplayName(name: string) {
  displayName = name.trim();
}

/** Falls back to "You" for guests, who have no profile name to show. */
export function localDisplayName() {
  return displayName || GUEST_LABEL;
}
