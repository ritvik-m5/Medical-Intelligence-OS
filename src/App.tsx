import { Suspense, lazy } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { TimeScrubber } from './components/TimeScrubber';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import { CommandPalette } from './components/CommandPalette';
import { BuilderView } from './views/BuilderView';

/*
 * The builder is the front door, so it is loaded eagerly: a landing page that
 * shows a spinner before it can show a composer has already lost the argument.
 *
 * Every workspace view is loaded on demand. They share one engine, so the engine
 * lands in the initial chunk either way; what this keeps out of it is thirteen
 * screens of layout, the canvas graph, the proof viewer and the cohort tables.
 */
const OverviewView = lazy(() =>
  import('./views/OverviewView').then((m) => ({ default: m.OverviewView })),
);
const TimeMachineView = lazy(() =>
  import('./views/TimeMachineView').then((m) => ({ default: m.TimeMachineView })),
);
const TemporalView = lazy(() =>
  import('./views/TemporalView').then((m) => ({ default: m.TemporalView })),
);
const GraphView = lazy(() => import('./views/GraphView').then((m) => ({ default: m.GraphView })));
const RecordsView = lazy(() =>
  import('./views/RecordsView').then((m) => ({ default: m.RecordsView })),
);
const DebuggerView = lazy(() =>
  import('./views/DebuggerView').then((m) => ({ default: m.DebuggerView })),
);
const InferenceView = lazy(() =>
  import('./views/InferenceView').then((m) => ({ default: m.InferenceView })),
);
const MeasurementsView = lazy(() =>
  import('./views/MeasurementsView').then((m) => ({ default: m.MeasurementsView })),
);
const AskView = lazy(() => import('./views/AskView').then((m) => ({ default: m.AskView })));
const ResearchView = lazy(() =>
  import('./views/ResearchView').then((m) => ({ default: m.ResearchView })),
);
const ResearchLabView = lazy(() =>
  import('./views/ResearchLabView').then((m) => ({ default: m.ResearchLabView })),
);
const HowItWorksView = lazy(() =>
  import('./views/HowItWorksView').then((m) => ({ default: m.HowItWorksView })),
);
const ChatView = lazy(() => import('./views/ChatView').then((m) => ({ default: m.ChatView })));
const HomeView = lazy(() => import('./views/HomeView').then((m) => ({ default: m.HomeView })));
const WhatIsThisView = lazy(() =>
  import('./views/WhatIsThisView').then((m) => ({ default: m.WhatIsThisView })),
);
const ResetView = lazy(() => import('./views/ResetView').then((m) => ({ default: m.ResetView })));
const QualityView = lazy(() =>
  import('./views/QualityView').then((m) => ({ default: m.QualityView })),
);
const CohortView = lazy(() =>
  import('./views/CohortView').then((m) => ({ default: m.CohortView })),
);
const InteropView = lazy(() =>
  import('./views/InteropView').then((m) => ({ default: m.InteropView })),
);

function ViewLoading() {
  return (
    <div className="view-loading" role="status" aria-live="polite">
      <span className="view-loading-dot" aria-hidden="true" />
      <span>Loading view</span>
    </div>
  );
}

function CurrentView() {
  const { view } = useStore();
  switch (view) {
    case 'guide':
      return <HowItWorksView />;
    case 'home':
      return <HomeView />;
    case 'whatis':
      return <WhatIsThisView />;
    case 'reset':
      return <ResetView />;
    case 'chat':
      return <ChatView />;
    case 'timemachine':
      return <TimeMachineView />;
    case 'temporal':
      return <TemporalView />;
    case 'graph':
      return <GraphView />;
    case 'records':
      return <RecordsView />;
    case 'debugger':
      return <DebuggerView />;
    case 'inference':
      return <InferenceView />;
    case 'measurements':
      return <MeasurementsView />;
    case 'ask':
      return <AskView />;
    case 'research':
      return <ResearchView />;
    case 'lab':
      return <ResearchLabView />;
    case 'quality':
      return <QualityView />;
    case 'cohort':
      return <CohortView />;
    case 'interop':
      return <InteropView />;
    case 'overview':
    default:
      return <OverviewView />;
  }
}

/**
 * The application shell.
 *
 * The builder is the front door and takes the full viewport: a landing page with
 * a permanent navigation rail beside it would undercut the point, which is that
 * the composer is the product. Every other view renders inside the workspace
 * chrome, with the sidebar, the scrubber and the evidence drawer.
 */
function Shell() {
  const { view, setView, mobileNavOpen, setMobileNavOpen } = useStore();
  const isBuilder = view === 'builder';
  const isChat = view === 'chat';

  if (isBuilder) {
    return (
      <>
        <div className="shell is-builder">
          <div className="main">
            <main className="view view--builder">
              <BuilderView onEnterWorkspace={() => setView('home')} />
            </main>
          </div>
        </div>
        {/* The builder cites spans too, so the evidence drawer has to exist here. */}
        <EvidenceDrawer />
        <CommandPalette />
      </>
    );
  }

  return (
    <>
      <div className={`shell${mobileNavOpen ? ' nav-open' : ''}`}>
        <Sidebar />
        <div
          className="nav-backdrop"
          aria-hidden="true"
          onClick={() => setMobileNavOpen(false)}
        />
        <div className={`main${isChat ? ' is-chat' : ''}`}>
          {!isChat && <TopBar />}
          <main className={`view${isChat ? ' view--chat' : ''}`}>
            <Suspense fallback={<ViewLoading />}>
              <CurrentView />
            </Suspense>
          </main>
          {!isChat && <TimeScrubber />}
        </div>
      </div>
      <EvidenceDrawer />
      <CommandPalette />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

