import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { FileCode2, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface MarkdownRendererProps {
  content: string;
  changedFiles?: string[];
  onFileClick?: (fileName: string) => void;
}

/** Language from className="language-ts" → "ts" */
function getLanguageFromClassName(className?: string): string {
  const match = /language-([\w-]+)/.exec(className || '');
  return match?.[1] ?? '';
}

/** Normalize common alias languages to langs supported by Prism. */
function normalizeLanguage(lang: string): string {
  if (!lang) return 'text';
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    rb: 'ruby',
    rs: 'rust',
    yml: 'yaml',
    md: 'markdown',
    html: 'markup',
    xml: 'markup',
    sql: 'sql',
    json: 'json',
    css: 'css',
    scss: 'scss',
  };
  return map[lang.toLowerCase()] ?? lang.toLowerCase();
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <SyntaxHighlighter
        language={normalizeLanguage(language)}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '0.75rem 1rem',
          background: 'transparent',
          fontSize: '0.8rem',
          lineHeight: '1.6',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: '0.8rem',
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
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

          // Extract plain text from React children so newline detection works
          // even when rehypeRaw produces nested elements inside the code block.
          // String(children) on a React element array yields "[object Object]",
          // which never includes newlines and falsely marks block code as inline.
          const extractText = (node: unknown): string => {
            if (typeof node === 'string') return node;
            if (Array.isArray(node)) return node.map(extractText).join('');
            if (node && typeof node === 'object' && 'props' in (node as any)) {
              return extractText((node as any).props?.children);
            }
            return '';
          };

          const textContent = extractText(children);
          const language = getLanguageFromClassName(className);
          const isBlock = language !== '' || textContent.includes('\n');

          if (!isBlock) {
            const fileName = String(textContent).trim();
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
                  <span className="font-mono">{textContent}</span>
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
                {textContent}
              </code>
            );
          }

          // Block code with syntax highlighting + copy button
          return <CodeBlock code={textContent} language={normalizeLanguage(language)} />;
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