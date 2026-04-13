interface CodeBlockProps {
  code: string
  filename?: string
  showLineNumbers?: boolean
}

type TokenType = 'keyword' | 'string' | 'comment' | 'punctuation' | 'property' | 'method' | 'number' | 'plain'

interface Token {
  type: TokenType
  value: string
}

const KEYWORDS = new Set([
  'import', 'from', 'const', 'let', 'var', 'async', 'await', 'return',
  'export', 'default', 'function', 'new', 'try', 'catch', 'throw',
  'if', 'else', 'typeof', 'type', 'interface',
])

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < line.length) {
    if (line.startsWith('//', i)) {
      tokens.push({ type: 'comment', value: line.slice(i) })
      return tokens
    }

    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i]
      let j = i + 1
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++
        j++
      }
      tokens.push({ type: 'string', value: line.slice(i, j + 1) })
      i = j + 1
      continue
    }

    if (/\d/.test(line[i]) && (i === 0 || /[\s,:([]/.test(line[i - 1]))) {
      let j = i
      while (j < line.length && /[\d.]/.test(line[j])) j++
      tokens.push({ type: 'number', value: line.slice(i, j) })
      i = j
      continue
    }

    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++
      const word = line.slice(i, j)

      if (KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', value: word })
      } else if (j < line.length && line[j] === '(') {
        tokens.push({ type: 'method', value: word })
      } else if (i > 0 && line[i - 1] === '.') {
        tokens.push({ type: 'property', value: word })
      } else {
        tokens.push({ type: 'plain', value: word })
      }
      i = j
      continue
    }

    if (/[{}()[\]:;.,=<>!&|?+\-*/~^%@]/.test(line[i])) {
      let j = i
      while (j < line.length && /[=<>!&|?+\-*/~^%]/.test(line[j]) && j - i < 3) j++
      if (j === i) j = i + 1
      tokens.push({ type: 'punctuation', value: line.slice(i, j) })
      i = j
      continue
    }

    let j = i
    while (j < line.length && !/[a-zA-Z0-9_$"'`/{}()[\]:;.,=<>!&|?+\-*/~^%@]/.test(line[j])) j++
    if (j === i) j = i + 1
    tokens.push({ type: 'plain', value: line.slice(i, j) })
    i = j
  }

  return tokens
}

const TOKEN_CLASSES: Record<TokenType, string> = {
  keyword: 'text-[#c792ea]',
  string: 'text-[#a5d6ff]',
  comment: 'text-[#545478] italic',
  punctuation: 'text-[#7a7a98]',
  property: 'text-[#82aaff]',
  method: 'text-[#82aaff]',
  number: 'text-[#f78c6c]',
  plain: 'text-[#c5c8d6]',
}

function HighlightedLine({ line }: { line: string }) {
  const tokens = tokenizeLine(line)
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={TOKEN_CLASSES[token.type]}>
          {token.value}
        </span>
      ))}
    </>
  )
}

function TrafficLights() {
  return (
    <div className="flex items-center gap-[7px]">
      <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
      <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
      <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
    </div>
  )
}

export function CodeBlock({
  code,
  filename,
  showLineNumbers = true,
}: CodeBlockProps) {
  const lines = code.split('\n')

  return (
    <div className="code-block group overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/[0.04] bg-[#08080d] px-4 py-2.5">
        <TrafficLights />
        {filename && (
          <span className="text-[11px] font-medium tracking-wide text-foreground-muted">
            {filename}
          </span>
        )}
      </div>
      <div className="overflow-x-auto px-4 py-4">
        <pre className="font-mono text-[13px] leading-[1.75]">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span className="mr-5 inline-block w-5 shrink-0 select-none text-right text-[12px] leading-[1.75] text-white/[0.12]">
                  {i + 1}
                </span>
              )}
              <code>
                <HighlightedLine line={line} />
                {!line && ' '}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}
