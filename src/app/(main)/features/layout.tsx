import WorkspaceLayout from "../[workspaceId]/layout";

interface FeaturesLayoutProps {
    children: React.ReactNode;
}

export default async function FeaturesLayout({ children }: FeaturesLayoutProps) {
    // Use the workspace layout with a dummy workspaceId parameter
    // The WorkspaceContext will handle the actual workspace resolution
    const dummyParams = Promise.resolve({ workspaceId: "", skipWorkspaceCheck: true });

    return (
        <WorkspaceLayout params={dummyParams}>
            {children}
        </WorkspaceLayout>
    );
} 