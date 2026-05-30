import { PATCH_NOTES } from '../patchNotes';

interface PatchNotesModalProps {
  onClose: () => void;
}

/**
 * "Patch notes" modal — a short changelog shown from the top bar. The content
 * lives in src/patchNotes.ts; prepend a new entry there each release.
 */
export default function PatchNotesModal({ onClose }: PatchNotesModalProps): React.JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card patchnotes-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Patch notes</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {PATCH_NOTES.map((note) => (
            <section className="patchnote" key={note.version}>
              <div className="patchnote-head">
                <h3>v{note.version}</h3>
                <span className="patchnote-date">{note.date}</span>
              </div>
              <ul className="patchnote-list">
                {note.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {note.thanks && <p className="patchnote-thanks">{note.thanks}</p>}
            </section>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
