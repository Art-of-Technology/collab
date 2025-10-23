import { ReactNode } from 'react';

interface DevLayoutProps {
  children: ReactNode;
}

export default function DevLayout({ children }: DevLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-bold">D</span>
            </div>
            <span className="font-semibold">Developer Console</span>
            <span className="text-xs bg-muted px-2 py-1 rounded">BETA</span>
          </div>
        </div>
      </div>
      <main>{children}</main>
    </div>
  );
}
