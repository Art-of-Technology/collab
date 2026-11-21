// Stand in for routing, account data, and panels outside the drawer test.
export default function Empty() {
  return null;
}
export const Link = ({ children, ...props }) => <a {...props}>{children}</a>;
export const dynamic = () => Empty;
export const usePathname = () => '/fixture/projects';
export const useRouter = () => ({ push() {} });
export const useWorkspace = () => ({ currentWorkspace: { id: 'fixture', slug: 'fixture' } });
export const useCurrentUser = () => ({ data: { name: 'Fixture User' } });
export const AIProvider = ({ children }) => children;
export const useAI = () => ({ focusInput() {}, quickActions: [] });
export const useAIWidget = useAI;
export const useAIAgents = () => ({});
export const useProjects = () => ({});
export const useViews = useProjects;
export const useInstalledApps = useProjects;
export const useSeatsWaiting = useProjects;
export const useCommandSearch = useProjects;
export const useToast = () => ({ toast() {} });
export const useQueryClient = () => ({});
export function signOutCurrentSession() {
  throw new Error('Unexpected sign out');
}
