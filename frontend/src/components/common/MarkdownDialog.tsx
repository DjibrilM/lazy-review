import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MarkdownDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  markdownContent: string;
}

export const MarkdownDialog: React.FC<MarkdownDialogProps> = ({
  isOpen,
  onOpenChange,
  title,
  markdownContent,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2 mt-4">
          <MarkdownRenderer content={markdownContent} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
