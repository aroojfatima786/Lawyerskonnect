import { FaStar, FaStarHalfAlt, FaRegStar } from 'react-icons/fa';

interface RatingProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  reviewCount?: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
}

export function Rating({
  value,
  max = 5,
  size = 'md',
  showValue = false,
  reviewCount,
  onChange,
  readonly = true,
}: RatingProps) {
  const sizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl',
  };

  const renderStar = (index: number) => {
    const filled = value >= index + 1;
    const halfFilled = value >= index + 0.5 && value < index + 1;

    const handleClick = () => {
      if (!readonly && onChange) {
        onChange(index + 1);
      }
    };

    const StarComponent = filled ? FaStar : halfFilled ? FaStarHalfAlt : FaRegStar;

    return (
      <button
        key={index}
        type="button"
        onClick={handleClick}
        disabled={readonly}
        className={`${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform text-amber-500`}
      >
        <StarComponent />
      </button>
    );
  };

  return (
    <div className={`inline-flex items-center gap-1 ${sizes[size]}`}>
      <div className="flex">
        {Array.from({ length: max }, (_, i) => renderStar(i))}
      </div>
      {showValue && (
        <span className="ml-1 font-semibold text-slate-700">
          {value.toFixed(1)}
        </span>
      )}
      {reviewCount !== undefined && (
        <span className="ml-1 text-slate-500 text-sm">
          ({reviewCount} reviews)
        </span>
      )}
    </div>
  );
}
