'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from '@/components/dev/docs/CodeBlock';

const unixCommand = `ZDOTDIR="\${ZDOTDIR:-$HOME}" bash -o pipefail -c 'curl -fsSL https://collab.weez.boo/install.sh | sh' && . "$HOME/.local/share/collab/env"`;
const platforms = [
  { id: 'windows', label: 'Windows', shell: 'PowerShell', command: 'irm https://collab.weez.boo/install.ps1 | iex', support: 'Windows 10+ (x64 / x86), Windows 11+ (ARM64) · PowerShell 5.1+', location: '%LOCALAPPDATA%\\Collab\\bin' },
  { id: 'macos', label: 'macOS', shell: 'Bash or Zsh', command: unixCommand, support: 'macOS 13 or later · Apple Silicon or Intel', location: '~/.local/bin' },
  { id: 'linux', label: 'Linux', shell: 'Bash or Zsh', command: unixCommand, support: 'Linux with glibc · ARM64 or x64', location: '~/.local/bin' },
];

export function Installation({ version }: { version: string }) {
  const [platform, setPlatform] = useState('windows');
  return (
    <div className="mt-5 min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="!mb-0">1. Choose your operating system</h3>
        <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">CLI {version}</span>
      </div>
      <Tabs value={platform} onValueChange={setPlatform}>
        <TabsList aria-label="Installation operating system" className="grid h-auto w-full grid-cols-3 sm:w-fit">
          {platforms.map(({ id, label }) => <TabsTrigger key={id} value={id} className="min-h-11 px-4">{label}</TabsTrigger>)}
        </TabsList>
        {platforms.map(({ id, shell, command, support, location }) => (
          <TabsContent key={id} value={id} forceMount hidden={platform !== id} className="mt-4 min-w-0 data-[state=inactive]:hidden">
            <p className="text-xs text-muted-foreground">{support}</p>
            <div className="mt-3 min-w-0 overflow-hidden rounded-lg border border-border">
              <p className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium">Paste into {shell}</p>
              <div className="[&_pre]:rounded-none [&_pre]:border-0 [&_pre]:pt-12"><CodeBlock code={command} /></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Installs to <code className="break-all">{location}</code>. Your current terminal is ready immediately; future terminals keep the command too.</p>
          </TabsContent>
        ))}
      </Tabs>
      <div className="border-t border-border pt-5">
        <h3>2. Verify, then connect your workspace</h3>
        <div className="min-w-0 [&_pre]:pt-12"><CodeBlock code={'collab --help'} /></div>
        <p className="mt-3 text-muted-foreground">Seeing the command list? You’re ready to log in.</p>
        <Button asChild variant="primary" className="mt-3 min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <a href="#authentication">Connect your workspace <ArrowRight aria-hidden="true" /></a>
        </Button>
      </div>
      <p className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground"><strong className="font-medium text-foreground">Already installed?</strong> Run the same install command to update. Your saved login is preserved. No administrator access or terminal restart needed.</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2 font-medium text-foreground">Which Windows download do I need?</summary>
        <p className="mt-2">The installer chooses automatically. For manual downloads, open Settings → System → About → System type. Choose x86 for a 32-bit operating system and x64 for a 64-bit Intel/AMD operating system. Choose ARM64 for an ARM-based processor on Windows 11 or later. A 32-bit PowerShell window on 64-bit Windows still installs the matching x64 or ARM64 executable.</p>
      </details>
    </div>
  );
}
