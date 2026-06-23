import { CybekWebcam, type CybekWebcamEvent } from '../../cybekWebcam.tsx';

export function CybekPortrait({
  active,
  eventName,
}: {
  active: boolean;
  eventName: CybekWebcamEvent;
}) {
  return (
    <div
      className={`cutscene-portrait cutscene-cybek-portrait${active ? ' active' : ''}`}
      role="img"
      aria-label="Cybek webcam"
    >
      <CybekWebcam eventName={eventName} />
    </div>
  );
}
