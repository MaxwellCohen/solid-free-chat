import { STARTER_FILES } from './dev-workspace'
import type { Files } from './dev-workspace'

export interface DevTemplate {
  id: string
  name: string
  files: Files
}

const INDEX_HTML =
  '<!doctype html>\n<html>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="./main.js"></script>\n  </body>\n</html>\n'

export const DEV_TEMPLATES: DevTemplate[] = [
  {
    id: 'counter',
    name: 'Counter',
    files: {
      'index.html': INDEX_HTML,
      'main.js': [
        "import './style.css'",
        '',
        "const app = document.querySelector('#app')",
        'let count = 0',
        "const label = document.createElement('p')",
        "const button = document.createElement('button')",
        "button.textContent = 'Increment'",
        'const render = () => {',
        '  label.textContent = `Count: ${count}`',
        '}',
        "button.addEventListener('click', () => {",
        '  count += 1',
        '  render()',
        '})',
        'app.append(label, button)',
        'render()',
        '',
      ].join('\n'),
      'style.css':
        'body { font-family: system-ui, sans-serif; padding: 2rem; }\nbutton { padding: 0.4rem 0.8rem; }\n',
    },
  },
  {
    id: 'todo',
    name: 'Todo list',
    files: {
      'index.html': INDEX_HTML,
      'main.js': [
        "import './style.css'",
        '',
        "const app = document.querySelector('#app')",
        'app.innerHTML = \'<form><input placeholder="New task" /><button>Add</button></form><ul></ul>\'',
        "const form = app.querySelector('form')",
        "const input = app.querySelector('input')",
        "const list = app.querySelector('ul')",
        "form.addEventListener('submit', (e) => {",
        '  e.preventDefault()',
        '  const text = input.value.trim()',
        '  if (!text) return',
        "  const li = document.createElement('li')",
        '  li.textContent = text',
        "  li.addEventListener('click', () => li.classList.toggle('done'))",
        '  list.append(li)',
        "  input.value = ''",
        '})',
        '',
      ].join('\n'),
      'style.css':
        'body { font-family: system-ui, sans-serif; padding: 2rem; }\nli { cursor: pointer; }\nli.done { text-decoration: line-through; opacity: 0.6; }\n',
    },
  },
  {
    id: 'canvas',
    name: 'Canvas',
    files: {
      'index.html':
        '<!doctype html>\n<html>\n  <body style="margin:0">\n    <canvas id="c" width="600" height="400"></canvas>\n    <script type="module" src="./main.js"></script>\n  </body>\n</html>\n',
      'main.js': [
        "const canvas = document.querySelector('#c')",
        "const ctx = canvas.getContext('2d')",
        'let x = 0',
        'const frame = () => {',
        "  ctx.fillStyle = '#111'",
        '  ctx.fillRect(0, 0, canvas.width, canvas.height)',
        "  ctx.fillStyle = '#4ade80'",
        '  ctx.beginPath()',
        '  ctx.arc(x, canvas.height / 2, 24, 0, Math.PI * 2)',
        '  ctx.fill()',
        '  x = (x + 2) % canvas.width',
        '  requestAnimationFrame(frame)',
        '}',
        'frame()',
        '',
      ].join('\n'),
    },
  },
  {
    id: 'blank',
    name: 'Blank',
    files: { ...STARTER_FILES },
  },
]

export function getTemplateFiles(id: string): Files | undefined {
  const t = DEV_TEMPLATES.find((tpl) => tpl.id === id)
  return t ? { ...t.files } : undefined
}
