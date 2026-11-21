import { createRoot } from 'react-dom/client';
import LayoutWithSidebar from '@/components/layout/LayoutWithSidebar';
import SidebarProvider from '@/components/providers/SidebarProvider';

createRoot(document.getElementById('app')).render(
  <SidebarProvider>
    <LayoutWithSidebar pathname="/fixture/projects">
      <button style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
        Page action
      </button>
    </LayoutWithSidebar>
  </SidebarProvider>,
);
