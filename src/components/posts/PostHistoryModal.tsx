"use client";

import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import PostHistory from "./PostHistory";

interface PostHistoryModalProps {
    postId: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function PostHistoryModal({
    postId,
    isOpen,
    onOpenChange,
}: PostHistoryModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto p-0 border-none">
                <PostHistory postId={postId} />
            </DialogContent>
        </Dialog>
    );
} 