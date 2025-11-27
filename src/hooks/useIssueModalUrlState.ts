import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function useIssueModalUrlState() {
    const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
    const [parentIssueInfo, setParentIssueInfo] = useState<{ title: string; key: string } | null>(null);
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    // Sync state from URL on mount and when URL changes
    useEffect(() => {
        const issueId = searchParams.get('selectedIssue');
        const parentTitle = searchParams.get('parentTitle');
        const parentKey = searchParams.get('parentKey');

        // Only update state if it's different from current state to avoid unnecessary re-renders
        setSelectedIssueId((currentIssueId) => {
            if (issueId !== currentIssueId) {
                return issueId || null;
            }
            return currentIssueId;
        });

        setParentIssueInfo((currentParentInfo) => {
            const newParentInfo = parentTitle && parentKey ? { title: parentTitle, key: parentKey } : null;
            const parentInfoChanged = 
                !newParentInfo && !currentParentInfo ? false :
                !newParentInfo || !currentParentInfo ? true :
                newParentInfo.title !== currentParentInfo.title || newParentInfo.key !== currentParentInfo.key;

            if (parentInfoChanged) {
                return newParentInfo;
            }
            return currentParentInfo;
        });
    }, [searchParams]);

    const updateUrl = useCallback((issueId: string | null, parentInfo?: { title: string; key: string } | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (issueId) {
            params.set('selectedIssue', issueId);
            if (parentInfo) {
                params.set('parentTitle', parentInfo.title);
                params.set('parentKey', parentInfo.key);
            }
        } else {
            params.delete('selectedIssue');
            params.delete('parentTitle');
            params.delete('parentKey');
        }

        // Use replace to avoid cluttering history, or push if you want back button support
        // Using push here so back button closes the modal which is intuitive
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
    }, [searchParams, pathname, router]);

    const handleSetSelectedIssueId = useCallback((issueId: string | null, parentInfo?: { title: string; key: string } | null) => {
        setSelectedIssueId(issueId);
        setParentIssueInfo(parentInfo || null);
        updateUrl(issueId, parentInfo);
    }, [updateUrl]);

    const closeModal = useCallback(() => {
        setSelectedIssueId(null);
        setParentIssueInfo(null);
        updateUrl(null);
    }, [updateUrl]);

    return {
        selectedIssueId,
        parentIssueInfo,
        setSelectedIssueId: handleSetSelectedIssueId,
        closeModal
    };
}
