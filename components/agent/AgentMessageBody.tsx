// components/agent/AgentMessageBody.tsx
//
// Renders one agent reply: headings, lists, tables, links, bold and code,
// parsed by lib/agent/agentMarkdown.ts. Everything becomes React elements —
// no HTML strings — so text the agent copied from a web page or an email can
// never inject markup. Link targets were already allow-listed by the parser.
//
// Styling lives under `.agent-md` in styles/globals.css.

import React, { useMemo } from 'react';
import {
  parseAgentMarkdown,
  type MdBlock,
  type MdInline,
  type MdList,
} from '../../lib/agent/agentMarkdown';

type Props = {
  /** The reply text exactly as the agent sent it. */
  content: string;
};

/**
 * One agent reply, fully shown — never collapsed behind "Show more".
 *
 * @param props.content - Reply text (Markdown subset).
 */
export default function AgentMessageBody({ content }: Props) {
  // Parsing is cheap, but the thread re-renders on every keystroke in the
  // input box; memoising keeps long histories from re-parsing each time.
  const blocks = useMemo(() => parseAgentMarkdown(content), [content]);
  return <div className="agent-md">{renderBlocks(blocks)}</div>;
}

function renderBlocks(blocks: MdBlock[]): React.ReactNode[] {
  return blocks.map((block, i) => renderBlock(block, i));
}

function renderBlock(block: MdBlock, key: number): React.ReactNode {
  switch (block.type) {
    case 'paragraph':
      return <p key={key}>{renderInlines(block.children)}</p>;
    case 'heading': {
      // h3–h5: replies sit below the host page's h1/h2 in the document outline.
      const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1];
      return <Tag key={key}>{renderInlines(block.children)}</Tag>;
    }
    case 'list':
      return renderList(block, key);
    case 'code_block':
      return <pre key={key}><code>{block.value}</code></pre>;
    case 'quote':
      return <blockquote key={key}>{renderBlocks(block.children)}</blockquote>;
    case 'rule':
      return <hr key={key} />;
    case 'table':
      return (
        // Focusable region so keyboard users can scroll a wide table sideways.
        <div key={key} className="agent-md-table" role="region" aria-label="Table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {block.head.map((cell, c) => (
                  <th key={c} scope="col" style={block.align[c] ? { textAlign: block.align[c] ?? undefined } : undefined}>
                    {renderInlines(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={block.align[c] ? { textAlign: block.align[c] ?? undefined } : undefined}>
                      {renderInlines(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function renderList(list: MdList, key: number): React.ReactNode {
  const items = list.items.map((item, i) => (
    <li key={i}>
      {renderInlines(item.children)}
      {item.sublists.map((sub, s) => renderList(sub, s))}
    </li>
  ));
  return list.ordered
    ? <ol key={key} start={list.start === 1 ? undefined : list.start}>{items}</ol>
    : <ul key={key}>{items}</ul>;
}

function renderInlines(nodes: MdInline[]): React.ReactNode[] {
  return nodes.map((node, i) => renderInline(node, i));
}

function renderInline(node: MdInline, key: number): React.ReactNode {
  switch (node.type) {
    case 'text':
      return <React.Fragment key={key}>{node.value}</React.Fragment>;
    case 'strong':
      return <strong key={key}>{renderInlines(node.children)}</strong>;
    case 'em':
      return <em key={key}>{renderInlines(node.children)}</em>;
    case 'code':
      return <code key={key}>{node.value}</code>;
    case 'break':
      return <br key={key} />;
    case 'link': {
      const external = !node.href.startsWith('mailto:');
      return (
        <a
          key={key}
          href={node.href}
          // External pages open in a new tab so the chat (and any approval card) stays put.
          {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
        >
          {renderInlines(node.children)}
          {external && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
      );
    }
  }
}
