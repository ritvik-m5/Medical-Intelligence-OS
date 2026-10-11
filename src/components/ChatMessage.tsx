import { Icon } from './Icon';

/** Render engine prose: `**Title** — detail` becomes a titled block. */
export function MessageContent({
  paragraphs,
  hero = false,
}: {
  paragraphs: string[];
  /** Give the first block hero treatment (the single answer, set large). */
  hero?: boolean;
}) {
  return (
    <div className="chat-message-body">
      {paragraphs.map((paragraph, index) => (
        <MessageBlock key={index} text={paragraph} hero={hero && index === 0} />
      ))}
    </div>
  );
}

function MessageBlock({ text, hero = false }: { text: string; hero?: boolean }) {
  const titled = text.match(/^\*\*([^*]+)\*\*\s*[—–-]\s*(.+)$/s);
  if (titled) {
    return (
      <div className={`chat-block${hero ? ' is-hero' : ''}`}>
        <div className="chat-block-title">{titled[1]}</div>
        <div className="chat-block-detail">{titled[2]}</div>
      </div>
    );
  }

  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className={`chat-para${hero ? ' is-hero' : ''}`}>
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export function AssistantAvatar() {
  return (
    <div className="chat-avatar" aria-hidden="true">
      <Icon.Research size={14} />
    </div>
  );
}
