import type { CSSProperties, ReactNode } from 'react';

export const DESKTOP_GRID_COLUMNS = 16;
export const DESKTOP_GRID_ROWS = 9;

export type DesktopGridPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function DesktopGrid({
  children,
  showOverlay,
}: {
  children: ReactNode;
  showOverlay: boolean;
}) {
  return (
    <>
      <section
        className="desktop-grid"
        aria-label="Kafelki pulpitu"
        data-columns={DESKTOP_GRID_COLUMNS}
        data-rows={DESKTOP_GRID_ROWS}
      >
        <div className="desktop-grid-items">{children}</div>
      </section>
      {showOverlay && <DesktopGridOverlay />}
    </>
  );
}

export function DesktopGridItem({
  placement,
  children,
}: {
  placement: DesktopGridPlacement;
  children: ReactNode;
}) {
  const safePlacement = normalizePlacement(placement);
  const style = {
    '--desktop-grid-x': safePlacement.x,
    '--desktop-grid-y': safePlacement.y,
    '--desktop-grid-width': safePlacement.width,
    '--desktop-grid-height': safePlacement.height,
  } as CSSProperties;

  return (
    <div
      className="desktop-grid-item"
      data-grid-x={safePlacement.x}
      data-grid-y={safePlacement.y}
      data-grid-width={safePlacement.width}
      data-grid-height={safePlacement.height}
      style={style}
    >
      {children}
    </div>
  );
}

function DesktopGridOverlay() {
  return (
    <div className="desktop-grid-overlay" aria-hidden="true">
      {Array.from({ length: DESKTOP_GRID_COLUMNS * DESKTOP_GRID_ROWS }, (_, index) => {
        const x = (index % DESKTOP_GRID_COLUMNS) + 1;
        const y = Math.floor(index / DESKTOP_GRID_COLUMNS) + 1;
        return <span key={`${x}-${y}`}>{x},{y}</span>;
      })}
    </div>
  );
}

function normalizePlacement(placement: DesktopGridPlacement): DesktopGridPlacement {
  const x = clamp(Math.round(placement.x), 1, DESKTOP_GRID_COLUMNS);
  const y = clamp(Math.round(placement.y), 1, DESKTOP_GRID_ROWS);
  const width = clamp(Math.round(placement.width), 1, DESKTOP_GRID_COLUMNS - x + 1);
  const height = clamp(Math.round(placement.height), 1, DESKTOP_GRID_ROWS - y + 1);
  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
