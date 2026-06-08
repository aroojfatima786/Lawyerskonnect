import { FiCheck } from 'react-icons/fi';

/** WhatsApp-style: double tick gray when sent, double tick blue when read. */
export function MessageReadTicks({ read, onDark = true }: { read: boolean; onDark?: boolean }) {
  const color = read
    ? onDark
      ? 'text-sky-300'
      : 'text-lk-accent'
    : onDark
      ? 'text-white/50'
      : 'text-slate-400';

  return (
    <span className={`inline-flex items-center pl-0.5 ${color}`} title={read ? 'Seen' : 'Sent'} aria-hidden>
      <FiCheck className="-mr-[7px] text-[13px]" strokeWidth={2.5} />
      <FiCheck className="text-[13px]" strokeWidth={2.5} />
    </span>
  );
}
