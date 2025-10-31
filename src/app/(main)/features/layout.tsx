import WorkspaceLayout from "../[workspaceId]/layout";

interface FeaturesLayoutProps {
    children: React.ReactNode;
}

export default async function FeaturesLayout({ children }: FeaturesLayoutProps) {
    // Use the workspace layout without a workspaceId since features don't require one
    // The WorkspaceContext will handle the actual workspace resolution when needed
    const params = Promise.resolve({ skipWorkspaceCheck: true });

    return (
        <WorkspaceLayout params={params}>
            {children}
        </WorkspaceLayout>
    );
} 