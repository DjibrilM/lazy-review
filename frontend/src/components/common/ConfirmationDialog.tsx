import React from 'react';
import { Button } from '@/components/ui/button';
import { Terminal, FileCode, Trash2, AlertTriangle } from 'lucide-react';

interface ConfirmationDialogueProps {
  type: 'read' | 'write' | 'edit' | 'delete' | 'shell' | 'basic';
  message?: string; // Optional custom message override
  command?: string; // Used specifically for the 'shell' type
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  cancelDisabled?: boolean;
}

export const ConfirmationDialogue: React.FC<ConfirmationDialogueProps> = ({
  type,
  message,
  command,
  onConfirm,
  onCancel,
  confirmText = 'Allow access',
  cancelText = 'Deny access',
  cancelDisabled = false,
}) => {
  // Map types to simple, default messages
  const defaultMessages: Record<string, string> = {
    read: 'The agent is requesting permission to read this file.',
    write: 'The agent is requesting permission to write to this file.',
    edit: 'The agent is requesting permission to edit this file.',
    delete: 'The agent is requesting permission to permanently delete this file.',
    shell: 'The agent is requesting permission to run a shell command:',
    basic: 'Are you sure you want to proceed?',
  };

  const displayMessage = message || defaultMessages[type] || defaultMessages.basic;

  const getHeaderInfo = () => {
    switch (type) {
      case 'read':
        return { icon: <FileCode className="h-3.5 w-3.5 text-zinc-400" />, label: 'Read File Permission' };
      case 'write':
        return { icon: <FileCode className="h-3.5 w-3.5 text-zinc-400" />, label: 'Write File Permission' };
      case 'edit':
        return { icon: <FileCode className="h-3.5 w-3.5 text-zinc-400" />, label: 'Edit File Permission' };
      case 'delete':
        return { icon: <Trash2 className="h-3.5 w-3.5 text-zinc-400" />, label: 'Delete File Warning' };
      case 'shell':
        return { icon: <Terminal className="h-3.5 w-3.5 text-zinc-400" />, label: 'Execute Shell Command' };
      default:
        return { icon: <AlertTriangle className="h-3.5 w-3.5 text-zinc-400" />, label: 'Action Confirmation' };
    }
  };

  const header = getHeaderInfo();

  return (
    <div className="max-w-[800px] border border-zinc-800/80 w-full mx-auto rounded-xl bg-[#0c0c0e]/95 backdrop-blur-md p-4 text-white shadow-2xl selection:bg-emerald-500/20">
      <div className="space-y-3 pb-3">
        {/* Header Tag */}
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold border-b border-zinc-800/50 pb-1.5 select-none">
          {header.icon}
          <span>{header.label}</span>
        </div>

        {/* Message */}
        <p className="text-xs text-zinc-300 font-mono leading-relaxed">{displayMessage}</p>

        {/* Shell Highlight */}
        {type === 'shell' && command && (
          <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3 font-mono text-[11px] text-green-400 overflow-x-auto shadow-inner">
            <span className="text-zinc-600 select-none font-bold mr-1.5">$</span>
            {command}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 justify-end pt-2 border-t border-zinc-800/50 select-none">
        <Button
          onClick={onCancel}
          disabled={cancelDisabled}
          variant="outline"
          className="h-8 text-xs font-mono font-bold px-3.5 border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          {type === 'basic' ? 'No' : cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          className="h-8 text-xs font-mono font-bold px-3.5 bg-white hover:bg-zinc-100 text-black border border-white transition-all cursor-pointer"
        >
          {type === 'basic' ? 'Yes' : confirmText}
        </Button>
      </div>
    </div>
  );
};
