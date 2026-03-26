/**
 * Prototype cloud availability toggle for policy tests.
 * Default true; set `MOCK_CLOUD_AVAILABLE=false` to simulate cloud down.
 */
export function getCloudAvailable(): boolean {
  const v = process.env.MOCK_CLOUD_AVAILABLE;
  if (v === undefined) {
    return true;
  }
  const s = v.trim().toLowerCase();
  return s !== 'false' && s !== '0' && s !== 'no';
}
