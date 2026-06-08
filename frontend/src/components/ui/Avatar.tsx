import { FaUser } from 'react-icons/fa';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  online?: boolean;
}

export function Avatar({ src, name, size = 'md', className = '', online }: AvatarProps) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-base',
    xl: 'h-20 w-20 text-xl',
  };

  const getInitials = (name?: string) => {
    if (!name) return '';
    const parts = name.split(' ');
    return parts
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className={`${sizes[size]} flex items-center justify-center overflow-hidden rounded-full bg-lk-navy font-semibold text-white`}
      >
        {src ? (
          <img src={src} alt={name || 'Avatar'} className="h-full w-full object-cover" />
        ) : name ? (
          <span>{getInitials(name)}</span>
        ) : (
          <FaUser className="opacity-70" />
        )}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
            online ? 'bg-green-500' : 'bg-slate-400'
          }`}
        />
      )}
    </div>
  );
}
