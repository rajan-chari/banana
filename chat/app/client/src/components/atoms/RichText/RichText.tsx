import type { ReactNode } from 'react';
import type { Mention } from '../../../types/chat';
import styles from './RichText.module.css';

/**
 * Parses inline markdown-style formatting into React elements.
 *
 * Supported:
 *  - **bold** or __bold__
 *  - *italic* or _italic_
 *  - ~~strikethrough~~
 *  - `inline code`
 *  - ```code blocks```
 *  - @mentions (highlighted with accent colors)
 */

interface Token {
  type: 'text' | 'bold' | 'italic' | 'strike' | 'code' | 'codeblock';
  content: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Order matters: longer/more specific patterns first
  const regex =
    /```([\s\S]*?)```|`([^`\n]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|~~(.+?)~~/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push any preceding plain text
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      tokens.push({ type: 'codeblock', content: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ type: 'code', content: match[2] });
    } else if (match[3] !== undefined || match[4] !== undefined) {
      tokens.push({ type: 'bold', content: (match[3] ?? match[4])! });
    } else if (match[5] !== undefined || match[6] !== undefined) {
      tokens.push({ type: 'italic', content: (match[5] ?? match[6])! });
    } else if (match[7] !== undefined) {
      tokens.push({ type: 'strike', content: match[7] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return tokens;
}

function renderTokens(tokens: Token[]): ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case 'bold':
        return <strong key={i}>{token.content}</strong>;
      case 'italic':
        return <em key={i}>{token.content}</em>;
      case 'strike':
        return <s key={i}>{token.content}</s>;
      case 'code':
        return (
          <code key={i} className={styles.inlineCode}>
            {token.content}
          </code>
        );
      case 'codeblock':
        return (
          <pre key={i} className={styles.codeBlock}>
            <code>{token.content.replace(/^\n/, '')}</code>
          </pre>
        );
      default:
        return <span key={i}>{token.content}</span>;
    }
  });
}

/**
 * Splits content into segments: plain text and mention spans.
 * Mention segments are rendered with highlight styling.
 * Plain text segments go through markdown tokenization.
 */
function renderWithMentions(content: string, mentions: Mention[]): ReactNode[] {
  // Sort mentions by offset ascending
  const sorted = [...mentions].sort((a, b) => a.offset - b.offset);
  const parts: ReactNode[] = [];
  let lastEnd = 0;
  let keyIdx = 0;

  for (const mention of sorted) {
    // Text before this mention
    if (mention.offset > lastEnd) {
      const textBefore = content.slice(lastEnd, mention.offset);
      const tokens = tokenize(textBefore);
      parts.push(...renderTokens(tokens).map((node) => (
        <span key={`t${keyIdx++}`}>{node}</span>
      )));
    }

    // The mention itself
    const mentionText = content.slice(mention.offset, mention.offset + mention.length);
    parts.push(
      <span key={`m${keyIdx++}`} className={styles.mention} title={mention.displayName}>
        {mentionText}
      </span>,
    );

    lastEnd = mention.offset + mention.length;
  }

  // Text after last mention
  if (lastEnd < content.length) {
    const remaining = content.slice(lastEnd);
    const tokens = tokenize(remaining);
    parts.push(...renderTokens(tokens).map((node) => (
      <span key={`t${keyIdx++}`}>{node}</span>
    )));
  }

  return parts;
}

interface RichTextProps {
  content: string;
  mentions?: Mention[];
}

export function RichText({ content, mentions }: RichTextProps) {
  if (!content) return null;

  // If mentions exist, split by mention offsets first
  if (mentions && mentions.length > 0) {
    return <>{renderWithMentions(content, mentions)}</>;
  }

  const tokens = tokenize(content);
  // Fast path: no formatting found
  if (tokens.length === 1 && tokens[0]!.type === 'text') {
    return <>{content}</>;
  }
  return <>{renderTokens(tokens)}</>;
}
