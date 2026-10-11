import { useState } from 'react';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';

/* ------------------------------------------------------------------ */
/* Reset                                                               */
/*                                                                    */
/* One safe place to undo things. Every destructive action needs an     */
/* explicit confirmation, and each one states exactly what it removes   */
/* and what it leaves untouched. Nothing here is instant or silent.     */
/* ------------------------------------------------------------------ */

type ActionId = 'corpus' | 'saved' | 'turns' | 'audit';

interface Action {
  id: ActionId;
  title: string;
  detail: string;
  leaves: string;
  confirmLabel: string;
  danger: boolean;
  run: () => void;
}

export function ResetView() {
  const store = useStore();
  const [confirming, setConfirming] = useState<ActionId | null>(null);

  const actions: Action[] = [
    {
      id: 'corpus',
      title: 'Clear the imported record',
      detail: `Removes the ${store.userDocumentCount} document${store.userDocumentCount === 1 ? '' : 's'} you imported and returns the workspace to the empty state.`,
      leaves: 'Your saved record, conversations and audit log are untouched.',
      confirmLabel: 'Reset record',
      danger: true,
      run: store.resetCorpus,
    },
    {
      id: 'saved',
      title: 'Delete the saved record',
      detail: 'Removes the record saved in this browser, so it is not restored next time you open the app.',
      leaves: 'The record currently on screen stays until you reload.',
      confirmLabel: 'Delete saved record',
      danger: true,
      run: store.storage.forget,
    },
    {
      id: 'turns',
      title: 'Clear the conversation',
      detail: 'Deletes every question and answer in the Ask and Chat history.',
      leaves: 'The record itself is untouched.',
      confirmLabel: 'Clear conversation',
      danger: false,
      run: store.clearTurns,
    },
    {
      id: 'audit',
      title: 'Clear the audit log',
      detail: 'Removes the append-only record of actions taken this session.',
      leaves: 'The record and conversations are untouched.',
      confirmLabel: 'Clear audit log',
      danger: false,
      run: store.clearAudit,
    },
  ];

  return (
    <div className="reset">
      <header className="reset-head">
        <h1 className="reset-title">Reset</h1>
        <p className="reset-sub">
          A calm place to undo things. Nothing happens until you confirm it, and each action says
          exactly what it removes and what it leaves behind.
        </p>
      </header>

      <div className="reset-list">
        {actions.map((action) => {
          const isConfirming = confirming === action.id;
          return (
            <section key={action.id} className={`reset-card${isConfirming ? ' is-confirming' : ''}`}>
              <div className="reset-card-head">
                <h2 className="reset-card-title">{action.title}</h2>
              </div>
              <p className="reset-card-detail">{action.detail}</p>
              <p className="reset-card-leaves">
                <Icon.Check size={12} />
                {action.leaves}
              </p>
              <div className="reset-card-actions">
                {isConfirming ? (
                  <>
                    <button
                      type="button"
                      className={`btn is-sm${action.danger ? ' is-danger' : ''}`}
                      onClick={() => {
                        action.run();
                        setConfirming(null);
                      }}
                    >
                      {action.confirmLabel}
                    </button>
                    <button
                      type="button"
                      className="btn is-sm is-ghost"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`btn is-sm${action.danger ? ' is-danger' : ''}`}
                    onClick={() => setConfirming(action.id)}
                  >
                    {action.confirmLabel}…
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
