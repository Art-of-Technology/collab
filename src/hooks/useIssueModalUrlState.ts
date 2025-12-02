import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function useIssueModalUrlState() {
    const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
    const [parentIssueInfo, setParentIssueInfo] = useState<{ title: string; key: string } | null>(null);
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const isUpdatingFromCodeRef = useRef(false);

    // Sync state from URL on mount and when URL changes (only from external sources like back button)
    useEffect(() => {
        // Skip if we're updating from our own code to avoid circular updates
        if (isUpdatingFromCodeRef.current) {
            isUpdatingFromCodeRef.current = false;
            return;
        }

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
            
            if (
                (!newParentInfo && !currentParentInfo) ||
                (newParentInfo &&
                    currentParentInfo &&
                    newParentInfo.title === currentParentInfo.title &&
                    newParentInfo.key === currentParentInfo.key)
            ) {
                // No change in values, return previous reference
                return currentParentInfo;
            }
            // Values changed, return new object (or null)
            return newParentInfo;
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

        const newUrl = `${pathname}?${params.toString()}`;
        const currentUrl = `${pathname}?${searchParams.toString()}`;
        
        // Only update URL if it's different to avoid unnecessary updates
        if (newUrl !== currentUrl) {
            // Mark that we're updating from code to prevent useEffect from triggering
            isUpdatingFromCodeRef.current = true;
            
            // Use replace to avoid cluttering history, or push if you want back button support
            // Using push here so back button closes the modal which is intuitive
            router.push(newUrl, { scroll: false });
        }
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
