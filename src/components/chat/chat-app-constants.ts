/** Avoid calling OpenRouter during SSR (no localStorage yet; Worker may lack env). Client fetches after hydration. */
export const SKIP_MODEL_LIST_SSR = '__skip_model_list_ssr__'

export const SIDEBAR_OPEN_LS_KEY = 'solid-free-chat-sidebar-open'
export const OUTLINE_OPEN_LS_KEY = 'solid-free-chat-outline-open'
export const ZEN_SESSION_KEY = 'solid-free-chat-zen'
