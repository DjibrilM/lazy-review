import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import { FileCode2 } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  changedFiles?: string[];
  onFileClick?: (fileName: string) => void;
}

export const MarkdownRenderer = ({ content, changedFiles = [], onFileClick }: MarkdownRendererProps) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-semibold text-zinc-50 mt-8 mb-4">{children}</h1>
        ),

        h2: ({ children }) => (
          <h2 className="text-xl font-semibold text-zinc-100 mt-7 mb-3">{children}</h2>
        ),

        h3: ({ children }) => (
          <h3 className="text-lg font-medium text-zinc-100 mt-6 mb-2">{children}</h3>
        ),

        p: ({ children }) => <p className="leading-7 text-zinc-400 mb-4">{children}</p>,

        ul: ({ children }) => (
          <ul className="list-disc pl-6 space-y-1 text-zinc-400">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-6 space-y-2 text-zinc-400">{children}</ol>
        ),

        li: ({ children }) => <li className="leading-7">{children}</li>,

        blockquote: ({ children }) => (
          <blockquote
            className="
              border-l-2
              border-zinc-700
              pl-4
              italic
              text-zinc-500
              my-4
            "
          >
            {children}
          </blockquote>
        ),

        hr: () => <hr className="border-zinc-800 my-6" />,

        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="
              text-blue-400
              hover:text-blue-300
              underline
              underline-offset-4
            "
          >
            {children}
          </a>
        ),

        code(props) {
          const { children, className } = props;

          const isBlock = className?.includes('language-') || String(children).includes('\n');

          if (!isBlock) {
            const fileName = String(children).trim();
            const isChangedFile = changedFiles.includes(fileName);

            if (isChangedFile && onFileClick) {
              return (
                <button
                  onClick={() => onFileClick(fileName)}
                  className="
                    inline-flex items-center gap-1.5
                    rounded-md
                    border border-primary/30
                    bg-primary/10 hover:bg-primary/20
                    px-2 py-0.5
                    text-[0.9em] font-medium text-primary
                    transition-colors
                    align-middle
                  "
                  title="View this file in the diff"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span className="font-mono">{children}</span>
                </button>
              );
            }

            return (
              <code
                className="
                  rounded-md
                  border
                  border-white/10
                  bg-zinc-900
                  px-1.5
                  py-0.5
                  text-[0.9em]
                  text-zinc-100
                  font-mono
                "
              >
                {children}
              </code>
            );
          }

          return (
            <pre
              className="
                overflow-x-auto
                rounded-2xl
                border
                border-white/10
                bg-zinc-950
                p-4
                my-4
              "
            >
              <code
                className="
                  text-sm
                  font-mono
                  text-zinc-300
                "
              >
                {children}
              </code>
            </pre>
          );
        },

        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="w-full border-collapse">{children}</table>
          </div>
        ),

        thead: ({ children }) => <thead className="bg-zinc-900">{children}</thead>,

        th: ({ children }) => (
          <th
            className="
              border
              border-zinc-800
              px-4
              py-2
              text-left
              text-zinc-100
            "
          >
            {children}
          </th>
        ),

        td: ({ children }) => (
          <td
            className="
              border
              border-zinc-800
              px-4
              py-2
              text-zinc-400
            "
          >
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
