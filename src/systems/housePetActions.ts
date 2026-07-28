export function bedTuckAvailability(placed: readonly { id: string }[], petTucking: boolean) {
  const hasBed = placed.some((item) => item.id === 'bed');
  return {
    hasBed,
    disabled: !hasBed || petTucking,
    label: hasBed ? 'Tuck into bed (full energy!)' : 'Tuck into bed (needs a Dream Bed)',
  };
}
