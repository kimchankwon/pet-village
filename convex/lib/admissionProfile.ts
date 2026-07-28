const ACCESSORY_SLOTS = ['headLeft', 'headRight', 'body', 'extra'] as const;

export function sanitizeEquippedAccessories(value: unknown) {
  const sanitized: Partial<Record<(typeof ACCESSORY_SLOTS)[number], string>> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return sanitized;
  for (const slot of ACCESSORY_SLOTS) {
    const accessoryId = (value as Record<string, unknown>)[slot];
    if (typeof accessoryId === 'string' && accessoryId.length > 0 && accessoryId.length <= 64) {
      sanitized[slot] = accessoryId;
    }
  }
  return sanitized;
}
