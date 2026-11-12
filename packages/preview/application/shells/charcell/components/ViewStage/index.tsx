// A custom view: the stage bar (StageBar), the output heading with its
// controls (ViewControls), then the view, rendered through
// the generic view iframe, which the controller mounts and drives (the ready
// handshake delivers the current options, replayed on reload). One branch
// serves every registered view - no special-casing.
import { usePreviewController } from '../../controller-context';
import { PreviewPane } from '../PreviewPane';
import { HeadingRow } from '../HeadingRow';
import { ViewControls } from '../ViewControls';
import { StageBar } from '../StageBar';
import './index.css';

export function ViewStage({ viewId }: { viewId: string }) {
  const controller = usePreviewController();
  const view = controller.catalog.views.find((candidate) => candidate.id === viewId);
  return (
    <>
      <StageBar />
      <HeadingRow heading="output" end={<ViewControls view="output" />} />
      <div className="ViewStage">
        <PreviewPane title={(view?.label ?? viewId).toLowerCase()} viewId={viewId} />
      </div>
    </>
  );
}
