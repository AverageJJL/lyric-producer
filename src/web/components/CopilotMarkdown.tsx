import React, {useCallback, useMemo} from 'react';
import ReactMarkdown from 'react-markdown';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter';
import {vscDarkPlus} from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

type CopilotMarkdownProps = {
  content: string;
};

type CodeProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function CopilotMarkdown({content}: CopilotMarkdownProps) {
  const Code = useCallback(({inline, className, children, ...props}: CodeProps) => {
    const match = /language-(\w+)/.exec(className ?? '');
    const code = String(children ?? '').replace(/\n$/, '');

    if (!inline && match) {
      return (
        <div className="copilot-code-block">
          <div className="copilot-code-header">
            <span>{match[1]}</span>
          </div>
          <SyntaxHighlighter
            language={match[1]}
            PreTag="div"
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '14px 16px',
              background: 'transparent',
              fontSize: '13px',
              lineHeight: 1.7,
            }}
            {...props}>
            {code}
          </SyntaxHighlighter>
        </div>
      );
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }, []);

  const components = useMemo(() => ({
    code: Code,
    table: ({children, ...props}: React.TableHTMLAttributes<HTMLTableElement>) => (
      <div className="copilot-table-scroll">
        <table {...props}>{children}</table>
      </div>
    ),
    a: ({children, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a {...props} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
  }), [Code]);

  return (
    <div className="copilot-markdown obsidian-theme">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
