import { browser } from 'wxt/browser';
import type {
  RuntimeRequest,
  RuntimeResponse,
  StateSnapshot,
} from './messages';

export async function sendRuntimeMessage<T>(request: RuntimeRequest): Promise<T> {
  const response = (await browser.runtime.sendMessage(request)) as
    | RuntimeResponse<T>
    | undefined;
  if (!response) {
    throw new Error('No response from NoiseGate background service.');
  }
  if (!response.ok) {
    throw new Error(response.error || 'Unknown NoiseGate error.');
  }
  return response.data;
}

export async function fetchSnapshot(tabId?: number): Promise<StateSnapshot> {
  return sendRuntimeMessage<StateSnapshot>({
    type: 'GET_STATE_SNAPSHOT',
    tabId,
  });
}

export function formatRelativeTime(iso?: string): string {
  if (!iso) return 'Never';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
