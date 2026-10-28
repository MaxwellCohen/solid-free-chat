/** Avoid calling OpenRouter during SSR (no localStorage yet; Worker may lack env). Client fetches after hydration. */
export const SKIP_MODEL_LIST_SSR = '__skip_model_list_ssr__'

export const SIDEBAR_OPEN_LS_KEY = 'solid-free-chat-sidebar-open'
