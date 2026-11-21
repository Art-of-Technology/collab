import { createRoot } from 'react-dom/client';
import { useRef } from 'react';
import LayoutWithSidebar from '@/components/layout/LayoutWithSidebar';
import SidebarProvider from '@/components/providers/SidebarProvider';
import { KanbanMinimap } from '@/components/views/renderers/KanbanViewRenderer/components/KanbanMinimap';
import { WeekViewMinimap } from '@/components/views/renderers/PlanningViewRenderer/components/week-view/WeekViewMinimap';

function OverflowingView({ content }) {
  const scrollContainerRef = useRef(null);
  return (
    <>
      <div ref={scrollContainerRef} style={{ overflowX: 'auto' }}>
        <div style={{ width: 1200 }}>Horizontally scrolling content</div>
      </div>
      {content === 'kanban'
        ? <KanbanMinimap scrollContainerRef={scrollContainerRef} columns={[{ id: 'todo', name: 'Todo', issues: [] }]} />
        : <WeekViewMinimap scrollContainerRef={scrollContainerRef} days={[new Date(2026, 10, 21)]} />}
    </>
  );
}

const content = new URLSearchParams(window.location.search).get('content');

createRoot(document.getElementById('app')).render(
  <SidebarProvider>
    <LayoutWithSidebar pathname="/fixture/projects">
      <button style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
        Page action
      </button>
      {content === 'tall' && <>
        <div style={{ height: 1600 }}>Tall page content</div>
        <div>Last page item</div>
      </>}
      {(content === 'kanban' || content === 'week') && <OverflowingView content={content} />}
    </LayoutWithSidebar>
  </SidebarProvider>,
);
