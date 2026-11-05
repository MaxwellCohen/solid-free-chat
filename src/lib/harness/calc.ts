/** Safe math expression evaluator (shunting-yard; no eval / Function). */

export type CalcResult =
  { ok: true; value: number } | { ok: false; error: string }

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: '(' }
  | { t: ')' }
  | { t: ',' }

type Rpn =
  | { t: 'num'; v: number }
  | { t: 'op'; v: string }
  | { t: 'fn'; v: string; argc: number }

const CONSTANTS: Record<string, number | undefined> = Object.assign(
  Object.create(null),
  {
    pi: Math.PI,
    e: Math.E,
  },
)

const FUNCTIONS: Record<
  string,
  undefined | { min: number; max: number; fn: (...a: number[]) => number }
> = Object.assign(Object.create(null), {
  sqrt: { min: 1, max: 1, fn: Math.sqrt },
  sin: { min: 1, max: 1, fn: Math.sin },
  cos: { min: 1, max: 1, fn: Math.cos },
  tan: { min: 1, max: 1, fn: Math.tan },
  log: { min: 1, max: 1, fn: Math.log10 },
  ln: { min: 1, max: 1, fn: Math.log },
  abs: { min: 1, max: 1, fn: Math.abs },
  round: { min: 1, max: 1, fn: Math.round },
  floor: { min: 1, max: 1, fn: Math.floor },
  ceil: { min: 1, max: 1, fn: Math.ceil },
  min: { min: 1, max: Infinity, fn: Math.min },
  max: { min: 1, max: Infinity, fn: Math.max },
})

// 'neg' is unary minus. Higher binds tighter; '^' is right-associative and binds tighter than neg (-2^2 = -4).
const PREC: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  '%': 2,
  neg: 3,
  '^': 4,
}
const RIGHT = new Set(['^', 'neg'])

const MAX_LENGTH = 500

class CalcError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) {
      i++
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(input.slice(i))
      if (!m) throw new CalcError(`Invalid number at position ${i + 1}`)
      tokens.push({ t: 'num', v: Number(m[0]) })
      i += m[0].length
    } else if (/[a-zA-Z_]/.test(ch)) {
      const m = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(input.slice(i))!
      tokens.push({ t: 'id', v: m[0].toLowerCase() })
      i += m[0].length
    } else if ('+-*/^%'.includes(ch)) {
      tokens.push({ t: 'op', v: ch })
      i++
    } else if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ t: ch })
      i++
    } else {
      throw new CalcError(`Unexpected character "${ch}" at position ${i + 1}`)
    }
  }
  return tokens
}

type StackItem = { t: 'op'; v: string } | { t: 'fn'; v: string } | { t: '(' }

function toRpn(tokens: Token[]): Rpn[] {
  const out: Rpn[] = []
  const stack: StackItem[] = []
  // One frame per open paren; `fn` frames count function arguments.
  const frames: { fn: boolean; argc: number; empty: boolean }[] = []
  let expectOperand = true

  const popOps = (until: (top: StackItem) => boolean) => {
    while (stack.length && !until(stack[stack.length - 1])) {
      const top = stack.pop()!
      if (top.t === 'op') out.push(top)
      else throw new CalcError('Mismatched parentheses')
    }
  }

  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k]
    switch (tok.t) {
      case 'num':
        if (!expectOperand)
          throw new CalcError('Missing operator before number')
        out.push(tok)
        expectOperand = false
        break
      case 'id': {
        if (!expectOperand)
          throw new CalcError(`Missing operator before "${tok.v}"`)
        if (tokens[k + 1]?.t === '(') {
          if (!FUNCTIONS[tok.v])
            throw new CalcError(`Unknown function "${tok.v}"`)
          stack.push({ t: 'fn', v: tok.v })
        } else if (CONSTANTS[tok.v] !== undefined) {
          out.push({ t: 'num', v: CONSTANTS[tok.v]! })
          expectOperand = false
        } else if (FUNCTIONS[tok.v]) {
          throw new CalcError(`Function "${tok.v}" needs parentheses`)
        } else {
          throw new CalcError(`Unknown name "${tok.v}"`)
        }
        break
      }
      case 'op': {
        let op = tok.v
        if (expectOperand) {
          if (op === '-') op = 'neg'
          else if (op === '+')
            break // unary plus: ignore
          else throw new CalcError(`Unexpected operator "${op}"`)
        } else {
          expectOperand = true
        }
        if (op !== 'neg') {
          popOps(
            (top) =>
              top.t !== 'op' ||
              (RIGHT.has(op)
                ? PREC[top.v] <= PREC[op]
                : PREC[top.v] < PREC[op]),
          )
        }
        stack.push({ t: 'op', v: op })
        break
      }
      case '(': {
        if (!expectOperand) throw new CalcError('Missing operator before "("')
        const isFn = stack[stack.length - 1]?.t === 'fn'
        frames.push({ fn: isFn, argc: 1, empty: true })
        stack.push({ t: '(' })
        break
      }
      case ',': {
        const frame = frames.at(-1)
        if (!frame || !frame.fn) throw new CalcError('Unexpected ","')
        if (expectOperand) throw new CalcError('Missing argument before ","')
        popOps((top) => top.t === '(')
        frame.argc++
        expectOperand = true
        break
      }
      case ')': {
        const frame = frames.pop()
        if (!frame) throw new CalcError('Mismatched parentheses')
        if (
          expectOperand &&
          !(frame.fn && frame.empty && tokens[k - 1]?.t === '(')
        ) {
          throw new CalcError(
            tokens[k - 1]?.t === '('
              ? 'Empty parentheses'
              : 'Missing operand before ")"',
          )
        }
        popOps((top) => top.t === '(')
        stack.pop() // the "("
        if (frame.fn) {
          const fn = stack.pop() as { t: 'fn'; v: string }
          out.push({ t: 'fn', v: fn.v, argc: expectOperand ? 0 : frame.argc })
        }
        expectOperand = false
        break
      }
    }
    if (tok.t !== '(' && tok.t !== ',') {
      const frame = frames.at(-1)
      if (frame) frame.empty = false
    }
  }
  if (expectOperand)
    throw new CalcError(
      tokens.length ? 'Expression ends unexpectedly' : 'Empty expression',
    )
  if (frames.length) throw new CalcError('Mismatched parentheses')
  popOps(() => false)
  return out
}

function applyOp(op: string, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      if (b === 0) throw new CalcError('Division by zero')
      return a / b
    case '%':
      if (b === 0) throw new CalcError('Modulo by zero')
      return a % b
    default:
      return a ** b
  }
}

function evalRpn(rpn: Rpn[]): number {
  const st: number[] = []
  for (const item of rpn) {
    if (item.t === 'num') st.push(item.v)
    else if (item.t === 'op') {
      if (item.v === 'neg') st.push(-st.pop()!)
      else {
        const b = st.pop()!
        const a = st.pop()!
        st.push(applyOp(item.v, a, b))
      }
    } else {
      const spec = FUNCTIONS[item.v]!
      if (item.argc < spec.min || item.argc > spec.max) {
        throw new CalcError(
          `${item.v}() takes ${spec.max === Infinity ? `at least ${spec.min}` : spec.min} argument(s), got ${item.argc}`,
        )
      }
      const args = st.splice(st.length - item.argc, item.argc)
      st.push(spec.fn(...args))
    }
    if (!Number.isFinite(st[st.length - 1]))
      throw new CalcError('Result is not a finite number')
  }
  return st[0]
}

export function calculate(expression: string): CalcResult {
  try {
    if (typeof expression !== 'string' || !expression.trim())
      throw new CalcError('Empty expression')
    if (expression.length > MAX_LENGTH)
      throw new CalcError(`Expression too long (max ${MAX_LENGTH} chars)`)
    const value = evalRpn(toRpn(tokenize(expression)))
    return { ok: true, value: Number(value.toPrecision(12)) }
  } catch (err) {
    if (err instanceof CalcError) return { ok: false, error: err.message }
    return { ok: false, error: 'Could not evaluate expression' }
  }
}
