'use client';

import { useSignedUrl } from '@/lib/media';

export type Ring = 'new' | 'seen' | 'mine' | null;

export default function Avatar({
  name,
  path,
  size = 44,
  ring = null,
  online = false,
  plus = false,
  onClick,
  label,
}: {
  name: string;
  path?: string | null;
  size?: number;
  ring?: Ring;
  online?: boolean;
  plus?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const url = useSignedUrl(path ?? null);
  const shown = path ? url : null;
  const body = (
    <>
      <span className={`av-ring ${ring ?? ''}`}>
        <span className="av-in">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" draggable={false} />
          ) : (
            <span className="av-initial" style={{ fontSize: size * 0.43 }}>
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
      </span>
      {online && <span className="online-dot" />}
      {plus && <span className="av-plus">+</span>}
    </>
  );
  const style = { width: size, height: size };
  return onClick ? (
    <button className="av" style={style} onClick={onClick} aria-label={label ?? name}>
      {body}
    </button>
  ) : (
    <div className="av" style={style} aria-label={label ?? name}>
      {body}
    </div>
  );
}
