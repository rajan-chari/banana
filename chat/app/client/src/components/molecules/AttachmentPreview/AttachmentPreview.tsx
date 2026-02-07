import { useState } from 'react';
import { Icon } from '../../atoms/Icon';
import type { Attachment } from '../../../types/chat';
import styles from './AttachmentPreview.module.css';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentPreviewProps {
  attachment: Attachment;
}

export function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = attachment.mimeType.startsWith('image/');

  if (isImage) {
    return (
      <>
        <button
          className={styles.imageThumbnail}
          onClick={() => setLightboxOpen(true)}
          aria-label={`View ${attachment.fileName}`}
        >
          <img
            src={attachment.url}
            alt={attachment.fileName}
            className={styles.thumbnailImg}
            loading="lazy"
          />
        </button>
        {lightboxOpen && (
          <div className={styles.lightbox} onClick={() => setLightboxOpen(false)} role="dialog" aria-label="Image preview">
            <button className={styles.lightboxClose} onClick={() => setLightboxOpen(false)} aria-label="Close preview">
              <Icon name="close" size="lg" />
            </button>
            <img src={attachment.url} alt={attachment.fileName} className={styles.lightboxImg} />
          </div>
        )}
      </>
    );
  }

  return (
    <a href={attachment.url} download={attachment.fileName} className={styles.fileCard}>
      <div className={styles.fileIcon}>
        <Icon name="paperclip" size="md" />
      </div>
      <div className={styles.fileInfo}>
        <span className={styles.fileName}>{attachment.fileName}</span>
        <span className={styles.fileSize}>{formatFileSize(attachment.fileSize)}</span>
      </div>
    </a>
  );
}
