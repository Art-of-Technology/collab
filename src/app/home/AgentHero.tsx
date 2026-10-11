'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Circle, FileText, Pause, Play, Terminal } from 'lucide-react';
import styles from './agent-hero.module.css';

const steps = [
  {
    name: 'projects list', label: 'Find your project',
    command: 'collab projects list --json', focus: 'project',
    results: ['Find the shared project', 'Use its ID for scoped requests', 'Keep the same workspace permissions'],
    note: 'Start with the project your team already uses.',
  },
  {
    name: 'issues list', label: 'Read the work',
    command: 'collab issues list --project-id PROJECT_ID --limit 10 --json', focus: 'issue',
    results: ['Read the next issue', 'Keep its owner and priority in view', 'Return a bounded JSON result'],
    note: 'The issue is shared context, not a second task list.',
  },
  {
    name: 'search', label: 'Find a decision',
    command: 'collab search --query "release checklist" --mode keyword --type note --json', focus: 'note',
    results: ['Search the shared Notes', 'Find the decisions behind the work', 'Use keyword matching without a vector index'],
    note: 'Read the why before changing the what.',
  },
  {
    name: 'context get', label: 'Bring the context',
    command: 'collab context get --project-id PROJECT_ID --max-tokens 4000 --json', focus: 'context',
    results: ['Bring issues and Notes together', 'Include the decisions behind the work', 'Bound context to a token budget'],
    note: 'Give your existing agent the context to begin.',
  },
];

export default function AgentHero() {
  const [active, setActive] = useState(3);
  const [paused, setPaused] = useState(false);
  const selected = steps[active];

  return (
    <section id="agents" aria-labelledby="hero-title" className={styles.hero} data-paused={paused}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}><span aria-hidden="true" /> The workspace behind your agent</p>
        <h1 id="hero-title">Project management.<br /><span>Built for your agent.</span></h1>
        <p className={styles.lede}>One workspace for people. A native CLI for the AI agents working alongside them. Bring projects, issues and decisions into the terminal.</p>
        <div className={styles.actions}>
          <Link href="/docs/cli#installation" className={styles.primary}>Install the CLI <ArrowRight aria-hidden="true" size={16} /></Link>
          <Link href="/docs/cli#workflow" className={styles.secondary}>Explore the workflow <ArrowRight aria-hidden="true" size={16} /></Link>
        </div>
      </div>

      <figure className={styles.showcase}>
        <div className={styles.toolbar}>
          <span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span>
          <span>Customer portal</span>
          <span className={styles.example}>Example project</span>
          <button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused} className={styles.motion}>
            {paused ? <Play aria-hidden="true" size={12} /> : <Pause aria-hidden="true" size={12} />}
            {paused ? 'Resume motion' : 'Pause motion'}
          </button>
        </div>
        <div className={styles.stage}>
          <div className={styles.console}>
            <p className={styles.panelLabel}><Terminal aria-hidden="true" size={13} /> Your terminal / your agent</p>
            {steps.map((step, index) => (
              <div key={step.name} id={`agent-step-${index}`} hidden={active !== index} aria-label={step.label}>
                <div className={styles.command}>
                  <span aria-hidden="true">❯</span>
                  <code data-cli-example={step.name}>{step.command}<span className={styles.cursor} aria-hidden="true" /></code>
                </div>
                <ul className={styles.results} aria-label="What this command helps you do">
                  {step.results.map(result => <li key={result}><span aria-hidden="true">↳</span>{result}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className={styles.board}>
            <div className={styles.boardTitle}><span>Customer portal / Shared work</span><span>Illustrative data</span></div>
            <div className={styles.workItem} data-highlighted={['issue', 'context'].includes(selected.focus)}>
              <Circle aria-hidden="true" size={12} /><div><p>PORTAL-24 · ISSUE</p><h2>Make onboarding clear</h2></div><span className={styles.state}>To do</span>
            </div>
            <div className={styles.workItem} data-highlighted={['note', 'context'].includes(selected.focus)}>
              <FileText aria-hidden="true" size={12} /><div><p>PROJECT NOTE</p><h2>Release checklist &amp; decisions</h2></div><span className={styles.state}>Shared</span>
            </div>
            <div className={styles.workItem}>
              <Circle aria-hidden="true" size={12} /><div><p>PORTAL-21 · ISSUE</p><h2>Keep the handover useful</h2></div><span className={styles.state}>In progress</span>
            </div>
            <p className={styles.stepNote}>{selected.note}</p>
          </div>
        </div>
        <div className={styles.steps} role="group" aria-label="Explore the CLI workflow">
          {steps.map((step, index) => <button type="button" key={step.name} onClick={() => setActive(index)} aria-pressed={active === index} aria-controls={`agent-step-${index}`}><span>0{index + 1}</span>{step.label}</button>)}
        </div>
        <figcaption className={styles.caption}>Illustrative workflow. Sign in and select your workspace first; replace PROJECT_ID with an ID returned by projects list. These commands read data and do not start an autonomous agent.</figcaption>
      </figure>
      <div className={styles.below}><span>Shared issues. Shared decisions. A clearer starting point.</span><span>Native on macOS, Linux &amp; Windows. No Node.js required.</span></div>
      <div className={styles.benefits}>
        <div><p>STRUCTURED FOR TOOLS</p><h2>JSON your agent can use.</h2><span>Read projects, issues and Notes from scripts and your terminal workflow.</span></div>
        <div><p>GROUNDED IN THE PROJECT</p><h2>Decisions stay with the work.</h2><span>Give each session useful project context, bounded by a token budget.</span></div>
        <div><p>CONNECTED TO THE TEAM</p><h2>One source of truth.</h2><span>Planning and context live in Collab. Code and pull requests stay in GitHub.</span></div>
      </div>
    </section>
  );
}
