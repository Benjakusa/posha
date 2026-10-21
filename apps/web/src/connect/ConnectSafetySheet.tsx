import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Checkbox, TextArea } from '@posha/ui';
import type { PoshaApiClient } from '../api/client.js';

export type ConnectSafetyAction = 'report' | 'block';

export function ConnectSafetySheet({
  action,
  accessToken,
  api,
  sessionId,
  onClose,
  onComplete,
}: {
  action: ConnectSafetyAction;
  accessToken: string;
  api: PoshaApiClient;
  sessionId: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [reasonCode, setReasonCode] = useState('harassment');
  const [details, setDetails] = useState('');
  const [snapshotConsent, setSnapshotConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isReport = action === 'report';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isReport) {
        await api.reportConnectSession(
          accessToken,
          {
            sessionId,
            reasonCode,
            ...(details.trim() ? { details: details.trim() } : {}),
            snapshotConsent,
          },
          crypto.randomUUID(),
        );
      } else {
        await api.blockConnectSession(accessToken, sessionId);
      }
      onComplete();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'This action could not be completed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-safety-title"
      className="safety-sheet"
    >
      <form onSubmit={submit}>
        <h2 id="connect-safety-title">{isReport ? 'Report this chat' : 'Block this person?'}</h2>
        {isReport ? (
          <>
            <p>Reports go to the safety team. Your chat partner will not see your identity.</p>
            <label className="posha-label" htmlFor="connect-report-reason">
              Reason
            </label>
            <select
              className="posha-input"
              id="connect-report-reason"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.currentTarget.value)}
            >
              <option value="harassment">Harassment</option>
              <option value="threats">Threats</option>
              <option value="solicitation">Solicitation</option>
              <option value="explicit_content">Inappropriate content</option>
              <option value="spam">Spam</option>
              <option value="other">Something else</option>
            </select>
            <TextArea
              label="Details (optional)"
              maxLength={2000}
              onChange={(event) => setDetails(event.currentTarget.value)}
              value={details}
            />
            <Checkbox
              checked={snapshotConsent}
              description="If selected, the most recent messages may be shared with the safety team to review this report."
              label="Include recent chat messages"
              onChange={(event) => setSnapshotConsent(event.currentTarget.checked)}
            />
          </>
        ) : (
          <p>
            This person will not be able to match with you again. You can manage blocks in settings.
          </p>
        )}
        {error ? <p role="alert">{error}</p> : null}
        <div className="safety-sheet__actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={isReport ? 'primary' : 'danger'} loading={busy}>
            {isReport ? 'Send report' : 'Block person'}
          </Button>
        </div>
      </form>
    </section>
  );
}
