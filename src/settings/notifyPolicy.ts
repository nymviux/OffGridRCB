import { providerForKey } from '../ble/config';
import type { Severity } from '../ble/types';

/**
 * Should a verified alert ring? Muting a provider only silences it: the alert is still verified and kept in
 * history. 'extreme' always rings, like the top level of phone emergency alerts.
 */
export function shouldNotify(alert: { keyId: number; severity: Severity }, muted: ReadonlySet<string>): boolean {
  if (alert.severity === 'extreme') return true;
  const provider = providerForKey(alert.keyId);
  return !provider || !muted.has(provider.id);
}
