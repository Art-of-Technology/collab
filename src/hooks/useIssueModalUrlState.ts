import { useMemo, useCallback } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

export function useIssueModalUrlState() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const selectedIssueId = searchParams.get('selectedIssue');
    const parentTitle = searchParams.get('parentTitle');
    const parentKey = searchParams.get('parentKey');
    const parentIssueInfo = useMemo(() => parentTitle && parentKey
      ? { title: parentTitle, key: parentKey } : null, [parentTitle, parentKey]);

    const updateUrl = useCallback((issueId: string | null, parentInfo?: { title: string; key: string } | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (issueId) {
            params.set('selectedIssue', issueId);
            if (parentInfo) {
                params.set('parentTitle', parentInfo.title);
                params.set('parentKey', parentInfo.key);
            } else {
                params.delete('parentTitle');
                params.delete('parentKey');
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
            // Shallow update: Next syncs useSearchParams from history.pushState without a server round trip,
            // so opening an issue no longer re-renders the view page (and its issue query) on the server.
            // pushState keeps the back button closing the modal.
            window.history.pushState(null, '', newUrl);
        }
    }, [searchParams, pathname]);

    const handleSetSelectedIssueId = useCallback((issueId: string | null, parentInfo?: { title: string; key: string } | null) => {
        updateUrl(issueId, parentInfo);
    }, [updateUrl]);

    const closeModal = useCallback(() => {
        updateUrl(null);
    }, [updateUrl]);

    return {
        selectedIssueId,
        parentIssueInfo,
        setSelectedIssueId: handleSetSelectedIssueId,
        closeModal
    };
}
