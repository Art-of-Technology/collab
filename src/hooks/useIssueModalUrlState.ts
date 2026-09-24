import { useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function useIssueModalUrlState() {
    const searchParams = useSearchParams();
    const router = useRouter();
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
            // Use replace to avoid cluttering history, or push if you want back button support
            // Using push here so back button closes the modal which is intuitive
            router.push(newUrl, { scroll: false });
        }
    }, [searchParams, pathname, router]);

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
