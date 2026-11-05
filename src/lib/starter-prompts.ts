export interface StarterPrompt {
  id: string
  title: string
  description: string
  prompt: string
}

export const STARTER_PROMPTS: readonly StarterPrompt[] = [
  {
    id: 'explain',
    title: 'Explain a concept',
    description: 'Get a clear, simple explanation',
    prompt:
      'Explain how public-key cryptography works, as if I were new to it.',
  },
  {
    id: 'code',
    title: 'Write some code',
    description: 'Generate a small, working function',
    prompt:
      'Write a TypeScript function that debounces another function, with a short usage example.',
  },
  {
    id: 'diagram',
    title: 'Draw a diagram',
    description: 'Visualize a flow with Mermaid',
    prompt:
      'Draw a Mermaid flowchart of the steps in a typical user sign-in flow with password reset.',
  },
  {
    id: 'chart',
    title: 'Make a chart',
    description: 'Plot some data visually',
    prompt:
      'Make a bar chart comparing the populations of the five largest countries.',
  },
  {
    id: 'brainstorm',
    title: 'Brainstorm ideas',
    description: 'Get a list of fresh ideas',
    prompt:
      'Brainstorm 10 creative side-project ideas for learning a new programming language.',
  },
  {
    id: 'summarize',
    title: 'Summarize text',
    description: 'Paste text and get the key points',
    prompt: 'Summarize the following text in 5 bullet points:\n\n',
  },
]
