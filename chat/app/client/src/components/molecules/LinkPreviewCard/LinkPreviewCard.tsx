import type { LinkPreview } from '../../../types/chat';
import styles from './LinkPreviewCard.module.css';

interface LinkPreviewCardProps {
  preview: LinkPreview;
}

export function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  return (
    <a
      className={styles.card}
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={preview.title || preview.url}
    >
      <div className={styles.text}>
        <span className={styles.domain}>{preview.domain}</span>
        {preview.title && <span className={styles.title}>{preview.title}</span>}
        {preview.description && (
          <span className={styles.description}>{preview.description}</span>
        )}
      </div>
      {preview.imageUrl && (
        <img
          className={styles.thumbnail}
          src={preview.imageUrl}
          alt=""
          loading="lazy"
        />
      )}
    </a>
  );
}
