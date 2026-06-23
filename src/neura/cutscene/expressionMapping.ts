import type { CutsceneExpressionName } from './assetManifest.ts';
import type { CybekWebcamEvent } from '../../cybekWebcam.tsx';

export function neuraExpressionForIntent(intent?: string): CutsceneExpressionName {
  switch (intent) {
    case 'curious':
      return 'curious';
    case 'tired':
      return 'tired';
    case 'dry':
      return 'dry';
    case 'glitch':
      return 'glitch';
    case 'success':
      return 'delighted';
    case 'calm':
    default:
      return 'calm';
  }
}

export function cybekEventForIntent(intent?: string): CybekWebcamEvent {
  switch (intent) {
    case 'glitch':
      return 'glitch';
    case 'success':
      return 'published';
    case 'curious':
    case 'tired':
    case 'dry':
      return 'review';
    case 'calm':
    default:
      return 'idle';
  }
}
