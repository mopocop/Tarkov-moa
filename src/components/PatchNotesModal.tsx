import { PATCH_NOTES } from '../patchNotes';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../ui';

interface PatchNotesModalProps {
  onClose: () => void;
}

/**
 * "Patch notes" modal — a short changelog opened from the rail panel footer's
 * version button. The content lives in src/patchNotes.ts; prepend a new entry
 * there each release.
 */
export default function PatchNotesModal({ onClose }: PatchNotesModalProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Modal
      title={t('patchNotes.title')}
      onClose={onClose}
      size="md"
      footer={<Button variant="primary" onClick={onClose}>{t('common.gotIt')}</Button>}
    >
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
    </Modal>
  );
}
