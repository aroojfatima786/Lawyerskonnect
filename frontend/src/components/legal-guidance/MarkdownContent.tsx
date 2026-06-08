type Block =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;
    if (!line) continue;

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h2', text: line.slice(2).trim() });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [line.replace(/^\d+\.\s*/, '')];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (/^[-•*]\s/.test(line)) {
      const items: string[] = [line.replace(/^[-•*]\s*/, '')];
      while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-•*]\s*/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    const para: string[] = [line];
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || next.startsWith('#') || /^\d+\.\s/.test(next) || /^[-•*]\s/.test(next)) break;
      para.push(next);
      i++;
    }
    blocks.push({ type: 'p', text: para.join(' ') });
  }

  return blocks;
}

function inlineFormat(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-lk-navy">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function MarkdownContent({ content }: { content: string }) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-3 text-[0.9375rem] leading-[1.65] text-lk-navy">
      {blocks.map((block, idx) => {
        if (block.type === 'h2') {
          return (
            <h2 key={idx} className="pt-1 text-base font-semibold tracking-tight text-lk-navy">
              {inlineFormat(block.text)}
            </h2>
          );
        }
        if (block.type === 'h3') {
          return (
            <h3 key={idx} className="text-sm font-semibold text-lk-navy">
              {inlineFormat(block.text)}
            </h3>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={idx} className="ml-1 list-disc space-y-1.5 pl-5 marker:text-lk-accent">
              {block.items.map((item, j) => (
                <li key={j}>{inlineFormat(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={idx} className="ml-1 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-lk-accent">
              {block.items.map((item, j) => (
                <li key={j}>{inlineFormat(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {inlineFormat(block.text)}
          </p>
        );
      })}
    </div>
  );
}
