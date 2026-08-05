import {
  FolderOpen,
  Brain,
  Sparkles,
  PlayCircle,
  Workflow,
  Search,
  FileCode,
  CheckCircle,
  GitBranch,
} from 'lucide-react';

export const parseLogMessage = (msg: string) => {
  const cleanMsg = msg.trim();

  if (cleanMsg.includes('Starting codebase analysis')) {
    return {
      icon: <Workflow className="h-4 w-4 text-cyan-400 animate-pulse shrink-0 mt-0.5" />,
      text: (
        <span className="text-cyan-400 font-semibold">
          Initializing AI Agent analysis workflow...
        </span>
      ),
    };
  }

  if (cleanMsg.includes('Running research turn')) {
    const turnMatch = cleanMsg.match(/turn (\d+\/\d+)/);
    const turnInfo = turnMatch ? `Turn ${turnMatch[1]}` : 'Research';
    return {
      icon: <Brain className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />,
      text: (
        <span>
          <span className="text-purple-400 font-bold font-mono mr-2">[{turnInfo}]</span>
          Agent planning next steps and examining codebase files...
        </span>
      ),
    };
  }

  if (cleanMsg.includes('Invoking tool:')) {
    const toolPart = cleanMsg.replace('Invoking tool:', '').trim();
    const toolNameMatch = toolPart.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
    if (toolNameMatch) {
      const toolName = toolNameMatch[1];
      const toolArgsStr = toolNameMatch[2];
      let toolArgs: any = {};
      try {
        toolArgs = JSON.parse(toolArgsStr);
      } catch (e) {
        // Fallback
      }

      const pathVal = toolArgs.path || toolArgs.directoryPath || '';

      if (toolName === 'get_directory_tree') {
        return {
          icon: <GitBranch className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />,
          text: (
            <span>
              <span className="text-teal-400 font-bold mr-2">🌳 get_directory_tree</span>
              Scanning directory structure to map project layout
            </span>
          ),
        };
      }
      if (toolName === 'read_file' || toolName === 'view_file') {
        return {
          icon: <FileCode className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />,
          text: (
            <span>
              <span className="text-emerald-400 font-bold mr-2">📄 read_file</span>
              Reading file content:{' '}
              <code className="bg-zinc-900 border border-zinc-800 text-zinc-100 px-1.5 py-0.5 rounded font-bold text-xs">
                {pathVal || toolArgsStr}
              </code>
            </span>
          ),
        };
      }
      if (toolName === 'read_directory' || toolName === 'list_dir') {
        return {
          icon: <FolderOpen className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />,
          text: (
            <span>
              <span className="text-amber-400 font-bold mr-2">📂 list_dir</span>
              Listing contents of directory:{' '}
              <code className="bg-zinc-900 border border-zinc-800 text-zinc-100 px-1.5 py-0.5 rounded font-bold text-xs">
                {pathVal}
              </code>
            </span>
          ),
        };
      }

      return {
        icon: <Search className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />,
        text: (
          <span>
            <span className="text-indigo-400 font-bold mr-2">🔧 {toolName}</span>
            Arguments: <code className="text-zinc-400 text-xs">{toolArgsStr}</code>
          </span>
        ),
      };
    }
  }

  if (cleanMsg.includes('Research phase complete')) {
    return {
      icon: <Brain className="h-4 w-4 text-pink-400 shrink-0 mt-0.5 animate-pulse" />,
      text: (
        <span className="text-pink-400 font-semibold">
          Codebase research completed. Summarizing findings and synthesizing description...
        </span>
      ),
    };
  }

  if (cleanMsg.includes('Synthesis complete')) {
    return {
      icon: <Sparkles className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5 " />,
      text: (
        <span className="text-emerald-400 font-bold">
          ✨ Agent analysis synthesis complete! Project data saved successfully.
        </span>
      ),
    };
  }

  if (cleanMsg.includes('cloning repository')) {
    return {
      icon: <FolderOpen className="h-4 w-4 text-blue-400 shrink-0 mt-0.5 animate-pulse" />,
      text: (
        <span className="text-blue-400 font-semibold">
          Cloning remote repository into temporary build context...
        </span>
      ),
    };
  }

  if (cleanMsg.includes('cloned successfully')) {
    return {
      icon: <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />,
      text: <span className="text-emerald-400 font-semibold">Repository cloned successfully.</span>,
    };
  }

  return {
    icon: <PlayCircle className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />,
    text: <span>{msg}</span>,
  };
};
